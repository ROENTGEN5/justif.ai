# Justif.ai idle latency implementation plan

This plan covers opening the app after inactivity and waiting for the first visible answer. It focuses the broader [performance implementation plan](PERFORMANCE_IMPLEMENTATION_PLAN.md) on those two symptoms.

The preview and production builds target the same Render API. The working tree includes a mobile change that sends a background health request when the app returns to the foreground. Streaming already publishes the first answer text promptly, preserves partial answers and uses explicit recovery after an interruption. The live Render instance type, cold-start time and production bottlenecks still need verification.

## 1. Measure the delay before changing hosting or retrieval

1. Confirm the API URL used by the installed build and check the instance type and logs in Render. Record the release, device, network, embedding provider, chat model and corpus version. Use a test account and fixed development prompts, including a new chat, a follow-up in an existing chat and an exact legal provision.
2. Run at least five cold/warm pairs per idle scenario on an Android preview or release build. Include a fresh launch after force-closing, a return from the background and an app left open in the foreground. Allow at least 20 minutes without API traffic for Render Free tests. Account for monitoring probes and other traffic that could keep the service awake.
3. Run health-first and chat-first trials in separate idle windows. The health request and app warm-up can wake Render. For the chat-first baseline, use the existing authenticated stream evaluator or a baseline build without the resume change. For device trials, test sending immediately on resume and sending after a short pause.
4. Capture elapsed time to app shell, restored session, cached chat visibility, the first SSE status, first answer token, first visible answer and completed save. Time `/api/health` separately and record its HTTP status and `rag_ready` value. Keep the existing stream evaluation as an independent check of API time to first token.

| Observation | Where to look next |
| --- | --- |
| First health request is slow and the repeat is fast | Match the delay to Render startup logs and backend initialization timings. |
| Health returns quickly with `rag_ready: false` | Check Pinecone and embedding initialization. |
| App stays on **Checking your sign-in** | Measure session restore and any token refresh in `mobile/lib/sessionLoader.ts` and `mobile/lib/auth.tsx`. |
| Health is ready and the first answer takes time | Measure request preparation, planning, retrieval, and time to the first DeepSeek token. |
| First SSE token arrives quickly and screen text appears later | Measure the mobile stream-to-render delay. |

Keep durations on the clock where they were measured. Correlate them with an opaque request ID and record failures alongside successes. Keep prompts, tokens, personal messages and user identifiers out of timing logs.

## 2. Remove the hosting delay if confirmed

- If the deployed API is on Render Free and startup correlates with the delay, move the existing service to an always-on instance with sufficient memory for the configured embedding model, subject to the project budget. Keeping the existing API URL lets installed builds benefit from the hosting change. Render Free spins down after 15 minutes without traffic, and its documented restart time is about one minute. [Render service behavior](https://render.com/docs/faq#why-is-my-free-service-sometimes-slow-to-respond)
- Verify a deliberate restart before rollout. Measure the Pinecone connection and embedding initialization separately in `backend/app/main.py` and `backend/app/services/rag.py`. If startup is dominated by downloading the CPU embedding model, test a deploy-time model cache and verify the deployed artifact still fits the selected instance. If Pinecone or the embedding provider dominates, use that dependency's measured failure and latency behavior to choose startup timeouts.
- If the project stays on Free, ship the mobile mitigation in step 3. Plan for the first request after a quiet period to wait for wake-up, particularly when the app has stayed open in the foreground.

## 3. Make reopening responsive and show useful progress

- Validate the existing resume change in `mobile/app/_layout.tsx`. Keep warm-up non-blocking, allow one in-flight health request, and verify that the listener is removed on unmount. Use the existing account-scoped chat cache while refreshing history in the background. Verify sign-out and account switching before changing how cached data appears.
- Once auth is ready, allow the user to open the chat screen and compose while the API wakes. For a slow connection before the first SSE event, show a neutral status such as “Connecting to Justif.ai…” and switch to the server's progress stages as they arrive. Keep Supabase sign-in recovery in its current flow and change it only if the session measurements show a delay.
- Validate slow cold starts, offline recovery, repeated resumes and timeouts on a device. Keep the existing request ID and partial-answer recovery behavior. A health check or reconnect should never submit a prompt a second time.

## 4. Cut the largest measured delay before the first token

Add timing around auth and history or chat creation in `backend/app/routes/chat.py`. Extend the timings in `backend/app/services/chat_pipeline.py` to cover embedding, Pinecone query and evidence fetch, DeepSeek request to first nonempty token, and final persistence. Include first SSE event and first answer token as separate milestones. Reuse `backend/scripts/stream_eval.py` for authenticated API comparisons.

- If planning dominates, test expanding the existing deterministic shortcut for unambiguous requests. Include ambiguous and follow-up prompts in the comparison.
- If retrieval dominates, test cache reuse or candidate counts against the same corpus. Compare retrieved evidence, citation coverage and the handling of missing evidence before releasing.
- If generation dominates, profile provider time to first token with the same retrieved context and model settings. Evaluate prompt-size changes against answer and citation quality.
- If mobile rendering dominates, profile from token receipt to visible text on the release build before changing the existing stream buffer.

Ship the measured improvement independently so its effect can be verified and rolled back.

## 5. Release and verify

1. Save the baseline. If the cold start is confirmed, make the hosting change first and rerun the same idle tests against the unchanged mobile build. Then test the mobile update through the existing internal Android preview profile. Ship pipeline optimizations only if the warm-path measurements still warrant them.
2. For a service expected to stay awake, require successful and ready health responses after every tested idle interval. Use the warm baseline to set the latency target before rollout. A proposed starting target is a post-idle median first-token time within 20% of the warm median. Report each cold/warm pair and the absolute times alongside the percentage.
3. On the device, verify that existing signed-in users can see cached conversations and start composing while the API is waking. Check new and existing chats, token refresh, offline recovery and a connection interrupted after the first token. Confirm one saved turn per request, complete streamed text and intact legal citations.
4. Record the Render settings, backend revision and mobile build so each change can be rolled back independently. A return to Render Free restores idle spin-down. Keep the pre-change corpus and model settings available for any retrieval or generation experiment.

## Implementation results

- The mobile app warms the API on launch, resume, and composer focus after an idle period. Concurrent warm-ups share one request. Existing chats show cached history while refreshing, and sending with cached history cancels the pending refresh so a stale response cannot replace the new turn.
- The API records startup, request preparation, retrieval, time to first answer token and persistence. The authenticated stream evaluator now records response-header time, first status and answer token separately and uses a request ID to correlate with backend logs.
- All 120 backend CI tests, the mobile regression scripts, TypeScript and an Android release bundle export passed locally.
- The initial public health probe returned in 0.84 seconds. After a gap of over 20 minutes between these probes, the first request took 52.48 seconds and the immediate repeat took 0.25 seconds. All returned HTTP 200 with `rag_ready: true` and `embedding_provider: fastembed`. Other production traffic was unobserved. The slow health response establishes a delay before chat generation. Confirm the instance type and correlate the delay with Render startup logs before changing hosting.
- The background warm-up timeout was raised from 12 to 75 seconds to cover the observed startup. The UI continues while the health request is pending. Measuring deployed prompt latency requires an authenticated test session.
- The local Android APK build reached native compilation and hit the Windows Ninja path-length limit. The signed Expo preview requires authorization to upload the private mobile source. Render instance settings and production deployment are pending access to the Render dashboard.
