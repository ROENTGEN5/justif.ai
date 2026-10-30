# Chat trust and recovery rollout

Apply `backend/migrations/20261029_chat_trust.sql` once in Supabase SQL Editor, then deploy the backend and rebuild the mobile app. This migration is additive; do not rerun the base schema on an existing project. No remote database or deployment was changed during implementation.

The migration adds saved message sources, citation reports with owner policies, and durable request records. Completion locks the request and saves both messages and the replay response in one transaction. A concurrent retry returns 409; a completed retry returns its saved answer. Failed work can retry; abandoned work can be reclaimed after five minutes, with a lease preventing the old worker from saving. Deleting a completed request's chat cascades its replay snapshot; deleting an account cascades all request records and reports.

Existing messages have no historical excerpts; the source viewer labels that absence. Source numbers connect citing passages to retrieved excerpts. Indexed sources are not claimed to establish current law or independently verified claim support.

Recovery buttons retain their request identity while the screen remains mounted. They preserve the original question, filters, upload prompt and file reference. Pending recovery state does not survive app termination; old file references may require selecting the file again. Do not dismiss an ambiguous request and submit it as a new question if you intend to recover that same operation.

Before release, validate against disposable Supabase accounts: apply the migration, report a saved answer, reopen source excerpts, disconnect after a committed response and recover it, retry an upload, switch accounts offline, and delete the test data. Mocked checks do not certify deployed RLS, SQL execution, or physical-device layout.
