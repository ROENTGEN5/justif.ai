# Justif.ai performance implementation plan

Prepared 29 October 2026 (Asia/Manila).

## Goal and boundaries

Reduce time to the first visible answer, improve scrolling during streaming, prevent repeated work after network failures, and keep the API responsive with several users. Preserve legal evidence coverage, account isolation, complete persisted answers and citation behavior. This plan is ready for implementation; no speedup is claimed before measurement.

Use the current 142,707-vector corpus as the fixed comparison index. Use existing development prompts rather than an unexposed final evaluation set. Keep the same model, temperature, device and backend placement for paired comparisons. Local Ollama and deployed embedding services need separate results.

## 1. Capture a baseline

Files: `backend/scripts/evaluate.py`, `backend/scripts/stream_eval.py`, `backend/evaluation/performance/` (new), chat route and mobile timing instrumentation.

- Select 12 development cases: exact provision questions, plain-language English/Filipino/Taglish scenarios, a follow-up, clarification, abstention and refusal.
- Record request ID; database preparation; planning; embedding; Pinecone query and neighbor fetch; generation first token; persistence; server completion; mobile first visible answer and final render. Avoid logging credentials or raw personal messages.
- Separate server and mobile durations: their clocks are not synchronized. Status events are not answer tokens. Record cold/warm Ollama runs separately.
- Run three declared repetitions with one request at a time. Add controlled concurrency checks at two and five test users with an explicit bounded request budget. Retain failures and all observations.
- Record device, release/debug build, network, model settings, code hashes and corpus identity. Profile long chats with approximately 100 saved messages.

Deliverable: baseline JSON/CSV and short report with median, p95, maximum, failure counts and sample sizes. Small-sample p95 is descriptive. Measure visible rendering on a device; API timings cannot substitute for it.

## 2. Remove blocking database operations from async routes

Files: `backend/app/routes/chat.py`, `backend/app/services/supabase_client.py`, relevant route/security tests.

- First move complete synchronous database operations into functions executed through a bounded thread offload. Include chat ownership/history loading and `_save_chat_turn`; audit adjacent list/upload/rating routes for the same blocking pattern.
- Keep each operation's user client and JWT scoped to that request. Do not mutate a shared client's authorization header. Preserve ownership checks and database row-level security.
- Keep ordered operations sequential where necessary: authorize before loading history, create a chat before persisting its messages. Do not parallelize calls merely to reduce apparent duration.
- Bound database concurrency and configure supported network timeouts. A canceled await does not stop a synchronous thread's network call; document this and avoid spawning unlimited work.
- Profile client initialization. Evaluate an async Supabase migration separately if supported by the installed version and justified by the measurements.

Validation: a deliberately slow database stub must not stall an unrelated health request; ownership checks still deny a second test account; persistence errors remain visible; complete turns are saved once. Re-run authenticated route/security checks and two/five-user measurements.

Done when: database waits no longer block the event loop in the changed routes and observed throughput/tail latency do not regress.

## 3. Buffer mobile stream updates and remove extra display delay

Files: `mobile/lib/api.ts`, both `mobile/app/(main)/chat/index.tsx` and `[id].tsx`, `mobile/components/ChatBubble.tsx`, `mobile/hooks/useTypewriter.ts`.

- Buffer token fragments in refs and publish updates approximately every 50–100 ms. Show the first nonempty answer promptly; flush immediately on completion, failure or cancellation.
- Keep the final server answer authoritative and complete. Preserve Unicode, Markdown, citation markers and trailing fragments across arbitrary network chunk boundaries.
- Display streamed content directly rather than applying a second word-by-word animation. Keep optional animation for batch responses only, and prevent an end-of-stream transition from replaying the answer.
- Update only the active assistant message. Preserve stable references for unchanged messages and callbacks. Profile Markdown rendering before changing its component structure.
- Retain the existing FlatList and memoized bubble behavior. Tune list window/batch settings from device measurements; do not assume variable-height legal messages have fixed layouts.
- Stop timers and pending updates on unmount/chat navigation. Throttle auto-scroll independently and respect users who scrolled upward.

Validation: fixture streams split inside JSON/text boundaries; final text equals server response; no updates after unmount; completion flushes once; long-chat scrolling remains usable on the target device. Run TypeScript and lint, recording pre-existing failures separately.

Done when: rendering updates are bounded, final content is exact, and mobile first-visible/final-render results improve without scrolling regressions.

## 4. Make stream recovery explicit and prevent duplicate work

Files: `mobile/lib/api.ts`, chat screens, `backend/app/models/schemas.py`, chat routes, database migration and new request-lifecycle service/tests as needed.

- Remove automatic batch resubmission after ambiguous disconnects or missing completion events. Preserve partial text and offer an explicit recovery/retry action.
- Allow legacy-endpoint fallback only when endpoint unavailability is established before processing. An ordinary chat-not-found 404 must not be interpreted as proof that streaming is unsupported.
- Add client-generated request IDs scoped to authenticated users. Use a database uniqueness constraint for durable idempotency across workers/restarts. Store input identity and reject reuse with a different payload.
- Atomically claim requests before model generation. Track pending/running/completed/failed states and stored response/message identity. Repeated completed requests return the original result; in-flight duplicates do not start another generation.
- Design transactional persistence so crashes cannot leave messages saved while the request remains eligible for duplicate generation. Handle chat creation and orphan requests in the same lifecycle design.
- Define stale-request recovery with ownership/lease fencing, rather than blindly treating a timeout as proof the old worker stopped. If this scope is too large for the first release, ship removal of automatic resubmission first and keep retries explicitly non-idempotent until the durable lifecycle is ready.
- Add AbortSignal support and sensible connection/idle/total deadlines. Detect client disconnects on the server, close provider streams and stop avoidable work. Distinguish user cancellation from an execution error; define whether partial responses are retained or discarded.

Validation: concurrent duplicate requests, disconnect before/after persistence, stream ending without completion, duplicate IDs with changed payloads, expired authentication, worker restart, and explicit retry. Confirm one completed persisted turn per request identity and no silent success on incomplete streams.

Done when: a network interruption never automatically creates a second paid generation, and the declared recovery behavior passes the failure tests. Deploy the migration before requiring durable request IDs in clients.

## 5. Reuse AI clients and control long waits

Files: `backend/app/services/deepseek.py`, `backend/app/services/document_pipeline.py`, `backend/app/main.py`, client lifecycle tests.

- Create reusable asynchronous AI clients during application lifespan and close them at shutdown. Replace per-request `async with get_client()` ownership where appropriate so a request cannot close the shared client.
- Maintain separate clients or configurations for text generation and OCR where timeout/retry policies differ. Preserve the document pipeline's cancellation and bounded-fallback behavior.
- Set connection/pool limits appropriate to the measured concurrency and provider limits. Keep HTTP connection pooling enabled.
- Define per-stage and total deadlines; prevent retries after partial output. Retain enough output budget for legal conditions rather than globally shortening all answers.
- Ensure tests initialize or inject clients without depending on a live application lifespan; preserve provider usage records and cleanup on errors.

Validation: repeated requests reuse a client, one request does not close another's connection, shutdown closes resources, partial-stream errors do not replay generation, and document fallback regressions pass.

Done when: connection setup is reduced in measurements and cancellation/resource checks pass.

## 6. Tune planning and retrieval only after the preceding changes

Files: `backend/app/services/deepseek.py`, `response_planning.py`, `rag.py`, existing grounding/retrieval/planning tests.

- Retain the existing named-law-and-section planning shortcut. Identify additional deterministic shortcuts using measured frequent inputs; preserve ambiguity handling, user-language behavior and follow-up resolution. Never route a vague legal question out of scope just to avoid an AI call.
- Compare candidate pool sizes, for example 20/40 for ordinary queries and 40/100 for exact provisions. Retain adjacent-section reconstruction and missing-evidence behavior. Measure embedding, query, fetch and context costs separately.
- Change candidate counts only if reviewed evidence coverage and behavior remain acceptable on development cases. Include multi-law and long-section cases; speed alone is insufficient.
- Consider a bounded TTL cache of public retrieval results keyed by index/corpus version, query, law filters and retrieval settings. Exclude private uploaded content and personal-answer caching. Invalidate on index changes; do not cache errors or incomplete results as successful evidence.
- Preserve existing embedding and section caches. Measure their hit rates before adding another layer. Avoid caching a planner decision without the history and identity information it depends on.

Done when: the paired development comparison shows a measurable benefit with no newly identified material error or evidence omission. Retain a quality-preserving default if results are mixed.

## Rollout and acceptance

Implement packages independently in this order: baseline → database offload → stream rendering → safe recovery → AI pooling → planning/retrieval tuning. Recovery can be split into removing automatic retries and adding durable idempotency. Ship no database schema change without a rollback-compatible migration sequence.

After each package, run the directly relevant tests and the fixed paired development cases. Broader final checks: backend regression suite, mobile TypeScript/lint with known-failure accounting, authenticated account isolation, cancellation, upload/document smoke checks, and a release-device long-chat test. Do not label an interrupted backend suite passing.

Suggested engineering objectives, to be confirmed after baseline: lower median first-visible-answer time; no more than a 10% p95 regression under the same declared workload; no new duplicate submissions, material evidence omissions or cross-account errors. Report absolute milliseconds and counts alongside percentages. These are project targets, not validated legal-quality thresholds or production SLAs.

Deployment depends on the backend environment. Local Ollama works for the local backend; a remote backend cannot reach the developer computer through `localhost`. Test the intended production embedding endpoint separately. Keep the previous index and application configuration available for rollback.

## Deliverables and estimated effort

| Package | Deliverable | Indicative effort |
| --- | --- | --- |
| Baseline | Fixed workload, stage timings, device measurements | 0.5–1 day |
| Database concurrency | Nonblocking route operations and ownership regression checks | 1–2 days |
| Streaming UI | Buffered updates and direct streamed rendering | 0.5–1 day |
| Recovery | Explicit retry, cancellation, durable request lifecycle | 2–4 days |
| AI client pooling | Lifespan-owned clients and deadline tests | 0.5–1 day |
| Retrieval/planning | Measured experiments and retained quality checks | 1–2 days |

Total planning estimate: 5.5–11 engineering days, plus deployment/device availability and discovered defects. Optimize the first three packages before committing to deeper retrieval changes. Implementation is not started by creating this document.
