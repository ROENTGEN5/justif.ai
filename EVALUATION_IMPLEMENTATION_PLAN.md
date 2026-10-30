# Justif.ai evaluation implementation plan

Prepared: 28 October 2026 (Asia/Manila).

## Objective

Prepare a reproducible capstone evaluation of text answers, document analysis, authenticated mobile workflows, and usability. Deliver separate measurements for each area, tied to a specific app build. Existing improved scores are development evidence; this plan does not assume the app has passed an independent evaluation.

## Starting point

- Reuse `backend/scripts/evaluate.py` for pipeline and authenticated batch API runs, including saved answers, evidence, usage and source hashes.
- Reuse `backend/scripts/capstone_eval.py` and the existing reference/response review packet approach. Inspect and generalize v1-specific assumptions before using it with a new set.
- Keep `capstone-v1`, `generated-50`, `starter`, and `response-check-v1` as development data. Preserve all original labels and runs.
- Extend `backend/scripts/document_smoke.py`; its four synthetic cases are smoke checks, not a document benchmark.
- Exercise the current streaming implementation in `backend/app/services/chat_pipeline.py`, `backend/app/routes/chat.py`, and `mobile/lib/api.ts`. The earlier response upgrade report predates streaming.
- Existing offline/security checks do not establish that the deployed mobile, authentication and database flows work together.

## 1. Establish a reproducible development baseline

**Tasks**

1. Record the current Git revision, dirty working-tree status, and hashes of relevant backend/mobile files. Because the workspace has uncommitted changes, a commit ID alone is insufficient: retain a recoverable source snapshot excluding secrets and dependencies.
2. Record mobile build/version, backend environment identifier, model aliases and returned model IDs, generation settings, retrieval settings, dependencies, corpus hash and index identity. If an immutable index export/version is unavailable, disclose that limit and record any index updates.
3. Run existing backend regression tests, mobile lint and TypeScript checks. Classify failures as existing or newly introduced; do not silently omit them.
4. Run a small development smoke set through pipeline, batch API, streaming API and document analysis. Use dedicated test accounts and synthetic documents.
5. Recruit a qualified Philippine legal reviewer early; review scheduling can determine the timeline. Do not send requests without the user's chosen recipient and authorization.

**Deliverables**: `backend/evaluation/protocol-v2.md`, a versioned run-manifest schema, and a baseline report under ignored `backend/evaluation/runs/`.

**Done when**: another person can identify the exact tested build and configuration, and every failed or skipped check is recorded.

## 2. Close evaluation instrumentation gaps

**Tasks**

1. Extend the evaluation runner with a streaming API mode. Parse the actual event contract; retain partial output, explicit errors, incomplete streams and timeout outcomes. Test the parser with local fixture streams before calling live services.
2. Record request/case IDs, first visible answer time, total duration, HTTP/stream outcome, model usage when available and stage timings. Do not count a progress/status event as the first answer token. Use a monotonic clock.
3. Add bounded deadlines and cancellation checks where the baseline exposes gaps. Test interrupted streams and fallback behavior for duplicated requests, answers or persisted messages.
4. Associate timing records with persisted chats/messages where available, without placing tokens or raw document contents in routine logs. Evaluation answers and evidence belong in controlled run artifacts.
5. Generalize frozen-set verification and scoring for a new dataset directory. Validate family IDs, languages, evidence requirements, reviewer status and dataset hashes; preserve null/inapplicable scores and failed cases.
6. Expand CI to include evaluation-runner/report regression tests already present but absent from the explicit workflow test list. Keep live provider tests outside automatic pull-request checks.

**Suggested files**: extend `backend/scripts/evaluate.py`, `backend/scripts/capstone_eval.py`, and their existing tests; add telemetry changes only where needed in chat/document services and mobile API handling.

**Done when**: synthetic success, malformed event, disconnect, timeout, expired-token and duplicate-request cases produce understandable outcomes with no false success. Unavailable telemetry is marked unavailable rather than inferred.

## 3. Build and review a fresh text test set

**Proposed scope**: 45 prompts, balanced at 15 English, 15 Filipino and 15 Taglish. A practical allocation is 24 factual/scenario cases, nine follow-ups, six clarification cases, three abstentions and three refusals. Report distinct legal issue families; translated variants are related observations.

**Tasks**

1. Prepare `backend/evaluation/capstone-v2/` with questions, draft references, evidence requirements, source snapshots, manifest and review forms. Keep draft references explicitly unreviewed.
2. Cover natural everyday questions without law numbers as well as exact-provision queries. Include missing facts, jurisdiction mismatch, misleading premises, requested unsupported certainty, and history beyond the app's supported bound.
3. Include source-applicability cases: historical versus current-law questions, ambiguous identifiers, missing exceptions and unavailable applicable evidence. A qualified reviewer must establish expected legal claims and relevant source versions; do not infer current validity from retrieval alone.
4. Check exact overlap against all existing sets and manually inspect paraphrase/topic overlap. Document unavoidable overlap. Select legal issue families beyond the three laws emphasized in the previous small check where corpus coverage permits.
5. Have the legal reviewer validate keys before seeing app outputs. Have a fluent reviewer check Filipino/Taglish equivalence. Record actual qualifications, dates, corrections and applicable cases.
6. Freeze the questions, reviewed key, rubric and hashes before first app execution. Keep this set out of implementation smoke tests and debugging. Once its results guide fixes, it becomes development data for the revised build.

**Done when**: every case has a family ID, expected behavior, language and review status; factual cases have checked conditions and sufficient evidence requirements. Pending legal review remains an explicit limitation, not an automatic approval.

## 4. Expand document evaluation

**Proposed scope**: 12 synthetic or approved documents: three selectable PDFs, three scans, two photographs, two mixed/table-heavy documents, and two unreadable/invalid/over-limit cases. Define multiple questions per document if useful and report document and question counts separately.

**Tasks**

1. Add `backend/scripts/document_eval.py` and `backend/evaluation/documents-v1/` with fixture hashes, manually verified page text, expected fields, prompts and expected rejection/uncertainty behavior.
2. Score amounts, dates, names, missing/extra fields, page attribution and summary completeness separately. Check both the value and its associated field; number presence alone is insufficient.
3. Score document facts separately from legal interpretation and external legal citations. The latter requires reviewed legal references.
4. Exercise poor orientation, blur, tables, mixed OCR/selectable pages, partial extraction and the configured page/character/upload limits. Check that omitted material is disclosed.
5. Include document text containing instructions to ignore the user or invent facts. Verify evidence handling without claiming universal injection immunity.
6. Capture extraction/OCR/answer timings and provider fallback outcomes. Use deterministic mocked failures for orchestration tests and a declared live subset for real provider behavior.

**Done when**: every fixture has independently checked expected facts or rejection behavior, reproducible results, and page-level errors that can be inspected.

## 5. Validate complete mobile workflows

**Tasks**

1. Create `backend/evaluation/mobile-acceptance.md` with device/OS/build, account, steps, expected result, actual result and evidence fields. Manual acceptance testing is sufficient initially; automate stable high-value paths later.
2. Test sign-up/login/logout, token expiry, new chat, follow-up, streamed answer, opening a citation, upload, history restoration, and chat deletion using disposable records.
3. Use two test accounts to verify that reading, writing, streaming into, uploading to and deleting another account's chat are denied. Verify actual database access rules as well as route checks.
4. Interrupt network access mid-stream and mid-upload; test double taps, background/resume, app restart and a slow/erroring backend. Check the UI clears loading states and avoids silent data loss or duplicated submissions.
5. Include a conversation beyond the history bound and verify that the app handles lost context without fabricating earlier facts.
6. Add stable component accessibility/test identifiers only where needed for repeatable observation or future automation.

**Done when**: every declared workflow has a recorded outcome on the target device/build. Cross-account disclosure or mutation, unrecoverable crashes and silent data loss block readiness for participant testing.

## 6. Run the frozen evaluation and usability pilot

1. Freeze the candidate build after development checks. Run the held-out text and document sets using the declared execution protocol; retain the first run and every error. Pipeline runs supply retrieval evidence; API/mobile runs establish integrated behavior. Do not describe batch API success as mobile success.
2. Score retrieval coverage, legal correctness, completeness, language, behavior and citation support separately. A valid source number does not establish support for the cited claim.
3. Give saved answers to human reviewers without automated grades. Use the existing 0/1/2 rubric with explanations for critical errors and inapplicable dimensions. Prefer two independent reviewers when feasible; disclose if only one is available. Preserve independent ratings before adjudication.
4. Declare any repeat measurements in advance. For a small development reliability subset, retain all trials and report median, p95, maximum, failures and sample size. Separate cold/warm starts and document types; treat small-sample p95 as descriptive.
5. Run an observed usability pilot with approximately five to eight intended users after blocking workflow defects are resolved. Use synthetic scenarios, brief participation consent and no unnecessary sensitive information. Tasks: ask a question, follow up, inspect a source, upload a sample and reopen history.
6. Record completion, assistance, time, misunderstandings, clarity and perceived usefulness. Treat this as a formative pilot, not representative population evidence or legal correctness validation.

**Done when**: all planned cases and participant tasks have an outcome, including failures, and human results are clearly separated from AI estimates.

## 7. Report findings and prioritize fixes

Create `backend/evaluation/final-report.md` and an export bundle containing the protocol, frozen datasets/manifests, recoverable build information, saved runs, source/review packets, completed ratings and anonymized usability observations. Full runs are currently Git-ignored: explicitly verify the export contains them and excludes credentials and participant identifiers.

Report:

- Human-reviewed correctness and completeness with applicable denominators.
- Citation support and required evidence coverage as separate measures.
- Behavior/language results by language and case type, with family counts.
- Document field/page accuracy, unsupported additions and rejected inputs.
- Workflow completion, cross-account checks, failure recovery and usability observations.
- First answer/total latency, failures, scored counts and available token usage. Report cost only with verified pricing/billing and stated inclusions.
- Reference corrections, unreviewed cases, immutable-index limitations and all deviations from the protocol.

Set performance targets before live evaluation, using the development baseline and participant expectations. There is no pre-established validated legal accuracy pass threshold. Any expert-identified critical legal error requires investigation and disclosure; zero observed errors in this small sample is not proof of general safety.

Turn findings into issues ranked by impact: data exposure/crashes, material legal errors, missing conditions/evidence, OCR factual errors, failed recovery, then wording and visual polish. Validate fixes against development cases. A changed build requires another unexposed set for new independent performance claims.

## Suggested execution order and effort

| Work package | Indicative engineering effort | Dependency |
| --- | --- | --- |
| Baseline and protocol | 0.5–1 day | Existing environment |
| Streaming/telemetry/runner gaps | 1–2 days | Baseline |
| Text dataset and review materials | 1–2 days plus reviewer availability | Protocol; reviewer recruitment starts immediately |
| Document fixtures and runner | 1–2 days | Protocol and instrumentation |
| Mobile acceptance and necessary fixes | 1–2 days, depending on defects | Test build and accounts |
| Frozen execution and reporting | 1–2 days plus human review/pilot scheduling | Candidate build, frozen sets and checked keys |

These are planning estimates, not a delivery commitment. Reviewer availability and discovered defects can extend the schedule. Start with the baseline and streaming/mobile gaps; prepare reviewer materials alongside that work. Avoid adding unrelated features during evaluation preparation.
