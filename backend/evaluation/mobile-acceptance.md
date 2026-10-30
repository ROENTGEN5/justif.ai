# Mobile Acceptance Protocol & Pre-Device Validation Guide

This document defines the execution procedure for [`mobile-acceptance.csv`](mobile-acceptance.csv) on a physical Android/iOS handset with two disposable accounts (**Account A** and **Account B**) and records the automated contract verification completed prior to physical handset sign-off.

> **Evaluation Honesty Rule**: Per [`protocol-v2.md`](protocol-v2.md), automated transport/API tests verify code-level contracts and prevent regressions, but rows in [`mobile-acceptance.csv`](mobile-acceptance.csv) must remain `pending` until executed and evidenced on a physical device with two live accounts.

---

## 1. Priority Scenarios & Pre-Device Contract Verification

The five highest-risk mobile scenarios are prioritized below, alongside the code safeguards and automated tests that verify their underlying contracts:

1. **Interrupted Connections (`M07`, `M08`)**
   - **Code Safeguards**:
     - `streamMessage()` in [`mobile/lib/api.ts`](../../mobile/lib/api.ts) uses XHR incremental SSE parsing with a 90s timeout, attaches `partialAnswer` to mid-stream network errors, and never auto-resubmits on disconnect.
     - [`mobile/app/(main)/chat/index.tsx`](../../mobile/app/(main)/chat/index.tsx) and [`mobile/app/(main)/chat/[id].tsx`](../../mobile/app/(main)/chat/[id].tsx) retain any partial streamed text with `[Stream interrupted]` and surface explicit `Retry` and `Restore draft` buttons (`lastSubmittedRef`) so retry is always user-initiated with the same idempotent `request_id`.
   - **Automated Pre-Validation**:
     - `mobile/scripts/test-stream.cjs`: Verifies token buffering, mid-stream `onerror` partial answer preservation (`error.partialAnswer`), no automatic resubmission (`requests.length === count + 1`), incomplete stream rejection, timeout, and `AbortController` cancellation.
     - `backend/tests/test_stream_eval.py` & `backend/tests/test_chat_trust.py`: Verifies idempotent `request_id` replay (`test_stream_replay_returns_done_event_without_generation`) and lease release on failed generation (`test_failed_generation_releases_request_for_retry`).

2. **Expired Sessions (`M06`)**
   - **Code Safeguards**:
     - `getAuthHeaders()` in [`mobile/lib/api.ts`](../../mobile/lib/api.ts) checks for an active Supabase session and throws `"Not authenticated. Please sign in again."` when expired.
     - `getChats()` and `getChatMessages()` attach HTTP status codes and bypass offline cache fallback on `401`, `403`, and `404` responses so expired sessions cannot silently render stale data.
     - When a send or upload fails with an authentication/session error, `chat/index.tsx` and `chat/[id].tsx` preserve `lastSubmittedRef` and prefill `ChatInput` (`setPrefillText`) so the user's draft is not lost.
   - **Automated Pre-Validation**:
     - `mobile/scripts/test-stream.cjs`: Verifies `401` responses reject with the server error instead of falling back to cached conversations or messages.

3. **Account Isolation (`M11`)**
   - **Code Safeguards**:
     - Backend endpoints in [`backend/app/routes/chat.py`](../app/routes/chat.py) (`get_chat_messages`, `send_message`, `stream_chat`, `analyze_uploaded_file`, `delete_chat`) enforce `.eq("id", chat_id).eq("user_id", user.user_id)` in addition to Supabase RLS, returning `404 Chat not found or access denied`.
     - Mobile cache keys in [`mobile/lib/conversationCache.ts`](../../mobile/lib/conversationCache.ts) are scoped by `userId` (`readCache`, `writeCache`, `cacheOwner`), and `clearConversationCaches()` runs on sign-out.
   - **Automated Pre-Validation**:
     - `backend/tests/test_chat_trust.py` (`test_cross_account_isolation_blocks_read_write_stream_upload_and_delete`): Verifies a second user (`bob`) is denied (`404`) across read, write, stream, file upload, and delete on `alice`'s `chat_id`.
     - `mobile/scripts/test-cache.cjs`: Verifies user A's cached chats and messages are unreadable by user B (`getCachedChats('user-b') === null`).

4. **Document Uploads (`M05`)**
   - **Code Safeguards**:
     - [`backend/app/routes/chat.py`](../app/routes/chat.py) (`analyze_uploaded_file`) validates MIME types, enforces the 10 MB size cap, verifies magic bytes (`%PDF-`, PNG, JPEG, RIFF/WebP, HEIC `ftyp`), and returns `page_count`, `reading_warnings`, `is_legal_document`, and `sources`.
   - **Automated Pre-Validation**:
     - `backend/tests/test_document_eval.py` & `backend/tests/test_document_analysis_regressions.py`: Verifies multi-page PDF/image extraction, reading warnings, and grounded document analysis.

5. **Reopening & Deleting Chats (`M03`, `M10`, `M12`)**
   - **Code Safeguards**:
     - `getChats()` and `getChatMessages()` in [`mobile/lib/api.ts`](../../mobile/lib/api.ts) cache per-user history for offline recovery (`M10`), while refusing cache fallback on `403`/`404` (`M12`) and clearing in-memory message state in [`mobile/app/(main)/chat/[id].tsx`](../../mobile/app/(main)/chat/[id].tsx) when a chat has been deleted.
   - **Automated Pre-Validation**:
     - `mobile/scripts/test-stream.cjs`: Verifies `404` throws without returning cached messages (`M12`) and network disconnect returns cached messages (`M10`).

---

## 2. Step-by-Step Handset Execution Checklist (`M01`–`M14`)

### Prerequisites
- Target Android or iOS handset running a development or release build connected to the staging/local backend.
- Two disposable accounts created for testing: **Account A** and **Account B**.
- Screen recorder or screenshot capture enabled; record `device_build`, `actual`, `status` (`pass`/`fail`), and `evidence` path in [`mobile-acceptance.csv`](mobile-acceptance.csv).

| Case ID | Scenario | Handset Execution Steps | Pass Criteria |
| :--- | :--- | :--- | :--- |
| **M01** | Login and logout | Sign in as **Account A**, verify welcome screen loads, open Drawer -> Profile -> Sign Out. | Session starts cleanly and returns to `/login` on sign-out with local cache cleared. |
| **M02** | New question & streamed answer | Select a language (`English`, `Filipino`, or `Taglish`), use a Guided Topic Flow card or type a question, and tap Send. | Thinking status updates, answer streams smoothly, and 3-part structure (Explanation, Relevant Sources, Practical Next Steps) persists. |
| **M03** | Follow-up & reopen chat | Send a follow-up question in the same chat, navigate to New Chat, then reopen the conversation from the Drawer. | Follow-up uses prior context; reopening displays both turns and cited sources intact. |
| **M04** | Open cited source | Tap a citation badge `[Source 1]` or `SourceCard` in an assistant reply. | Source card expands to show official excerpt/section and opens the official URL when tapped. |
| **M05** | Upload synthetic PDF & image | Tap `+` attachment button, upload a multi-page synthetic PDF and a legal notice image with a prompt. | Upload completes, response matches document content/page count, and reading warnings display if applicable. |
| **M06** | Expired session | Invalidate or expire Account A's token while a draft is typed in `ChatInput`, then tap Send. | Error banner prompts re-authentication, `Restore draft` / prefilled input preserves the user's draft text. |
| **M07** | Disconnect mid-stream | Start streaming a response and toggle Airplane Mode ON mid-stream; toggle OFF and tap `Retry`. | Partial text is marked `[Stream interrupted]`, no automatic duplicate send occurs, and tapping `Retry` reuses `request_id`. |
| **M08** | Disconnect mid-upload | Start uploading a PDF and toggle Airplane Mode ON mid-upload; toggle OFF and tap `Retry` / `Restore draft`. | Loading state terminates with a clear error banner and explicit retry control. |
| **M09** | Double-tap send | Rapidly tap the Send button twice on a new question. | `sendingRef` guard and backend `@idempotent` replay ensure only one user + assistant turn is persisted. |
| **M10** | Background & restart | Background the app during/after a chat, force-close and relaunch the app, then open the chat from the Drawer. | Saved history and loading/idle state recover cleanly. |
| **M11** | Second account isolation | Record Account A's `chat_id` and `message_id`. Sign out, sign in as **Account B**, and attempt to read, send, stream, upload, or delete against Account A's `chat_id`. | Account B cannot see Account A's chats in Drawer (even offline) and all direct API/route attempts return `404`. |
| **M12** | Delete disposable chat | Delete a conversation from the Drawer and attempt to reopen it. | Chat disappears from Drawer immediately and attempting to load `/chat/{id}` does not render cached messages. |
| **M13** | Beyond context bound | In a chat with >12 prior messages, ask about a detail mentioned only in turn 1. | Assistant does not fabricate a recollection of truncated turns outside the 12-message window. |
| **M14** | Slow or unavailable backend | Stop or block the backend server and send a message. | Request fails within bounded timeout with an actionable error banner and `Retry` / `Restore draft` controls. |
