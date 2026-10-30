# Performance changes — 29 October 2026

## Implemented

- Supabase query execution, turn persistence, storage operations and JWKS network lookup run off the async event loop through a shared eight-slot thread limiter. Exceptions remain visible; cancellation retains the worker slot until the synchronous operation returns. This does not impose a deadline on an underlying synchronous network call.
- Streaming UI publishes the first fragment immediately and batches subsequent updates at 75 ms intervals. Completion/error flushes pending text. The streamed response no longer runs through the secondary typing animation, and completed streamed answers do not replay it.
- Stream errors, missing completion, timeout, and 404 responses no longer automatically resubmit a paid generation. Batch send also disables automatic retries. Partial streamed content stays visible after errors, and the error directs the user to check history before an explicit retry.
- Chat screens guard against repeated sends while a stream is active and abort on unmount. API transport accepts AbortSignal and has a 120-second total XHR deadline. Abort/disconnect does not guarantee that an already received provider request stops billing.
- Text AI calls reuse a lifespan-owned async client. Standalone scripts/tests use short-lived explicitly closed clients. Streams close in finally blocks, and output-budget truncation is an error rather than a silently successful partial answer. OCR retains its separate client/timeouts/retry settings.
- CI includes performance regression tests, TypeScript checks and mobile transport tests.

## Validation

- Backend: 108 tests ran; 103 passed and five optional tests skipped. The full suite was run outside the sandbox because Windows asyncio socket-pair setup stalled inside it. A traceback established that cause before retrying.
- New backend checks prove event-loop responsiveness while database work waits, error propagation and shared-client ownership/cleanup.
- Mobile transport harness passed buffering, Unicode/final flush, partial preservation, no resubmission, missing completion, 404, timeout and abort checks using the real transpiled API module and a fake transport.
- TypeScript passed. Full mobile lint retains four existing errors and 24 warnings; no clean-lint claim is made.
- No live speed percentage or production latency claim is established by these tests. The database responsiveness check is a controlled stub test, not a live Supabase load test.

## Remaining planned work

Measure fixed development prompts on the intended backend/device, including cold/warm embeddings and controlled concurrency, before assigning speed targets or changing candidate counts. The existing evaluator's stream-api mode records first-answer/total times; device final-render time still needs profiling.

Durable user-scoped request IDs, transactional request/message persistence and stale-request lease recovery require a database migration and are not implemented. Explicit user retries can still cause repeated work. This release removes automatic ambiguous retries rather than claiming exactly-once processing.

Planning shortcuts, new retrieval caching, candidate-pool reductions, OCR client pooling and index/schema changes were not introduced. Existing evidence coverage and routing rules remain the comparison baseline.

Restart the local backend to load these changes and reload the mobile application. No new runtime dependency, corpus upload or database migration is required for this release. Device UI smoothness and live authenticated cancellation still require verification. No production deployment was performed.
