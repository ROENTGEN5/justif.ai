# Evaluation implementation status — 29 October 2026

Completed tooling and product improvements:

- Streaming API evaluation mode with a total asynchronous deadline, no automatic retry, protocol validation, partial-answer retention and time to first answer.
- Median, nearest-rank p95, maximum and sample count in JSON summaries.
- Allowlisted source snapshot and hashes covering uncommitted implementation files, Git state and corpus hash. Does not snapshot the remote index or certify deployed code.
- Evaluation tests and mobile static/behavioral checks (`npm run lint`, `npx tsc --noEmit`, `test-stream.cjs`, `test-cache.cjs`, `test-guided-a11y.cjs`) included in CI.
- Version-two execution protocol, 14-case mobile acceptance record (`mobile-acceptance.csv`), and handset execution runbook (`mobile-acceptance.md`).
- Guided topic flows (`GuidedTopicFlow.tsx`) with explicit `English`, `Filipino`, and `Taglish` selection, optional 3-step intake (`What happened?`, `When?`, `What outcome do you want?`), and structured 3-part answers (short explanation, relevant sources, practical next steps).
- Mobile accessibility hardening: spoken labels and roles on icon/action buttons, large-text (`maxFontSizeMultiplier`) layout resilience, polite live-region announcements on request start/completion/error, and `accessibilityElementsHidden` during live token streaming so screen readers do not read every streamed token.
- Mobile cache isolation on `401`/`403`/`404` responses so expired sessions, unauthorized chats, or deleted chats never fall back to stale offline cache.

Validation performed:

- Full backend test discovery (`python -m unittest discover -s tests`) completed without stalling: 119 tests run (`OK`, 5 skipped optional integration tests), including stream collector, evaluation metrics, document regressions, and cross-account isolation (`M11`) across read, write, stream, upload, and delete.
- Mobile ESLint (`npm run lint`) passed with 0 errors and 0 warnings (resolved all prior hook, import, and unused-symbol issues).
- Mobile TypeScript check (`npx tsc --noEmit`) passed with 0 errors.
- Mobile behavioral test suites passed:
  - `node scripts/test-stream.cjs`: SSE token buffering, completion flush, partial preservation on disconnect, no automatic resubmission, timeout/abort handling, `401`/`403`/`404` non-fallback, and offline cache fallback.
  - `node scripts/test-cache.cjs`: User-scoped cache isolation between accounts.
  - `node scripts/test-guided-a11y.cjs`: Explicit `English`/`Filipino`/`Taglish` guided prompt composition, streaming screen-reader suppression (`accessibilityElementsHidden`), and 3-part answer presentation.
- Git whitespace check (`git diff --check`) passed.

Source capture: `runs/baselines/20261028T034421875098Z/`. This capture predates the latest UI/accessibility/status updates and is a preparation snapshot, not a final frozen evaluation build.

Remaining work:

- Fresh 45-case multilingual dataset, reviewed references and freeze safeguards.
- Twelve-document fixture set and dedicated document evaluation runner.
- Generalization of the capstone judge to the fresh reviewed key.
- Execute `mobile-acceptance.csv` (`M01`–`M14`) on a physical handset with two disposable accounts following `mobile-acceptance.md`.
- Qualified human reference/response review and observed usability pilot.
- Final held-out runs, report and submission export.

No new held-out accuracy result, physical-device acceptance sign-off, or completed human review is claimed.
