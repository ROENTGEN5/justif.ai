# PDF and image upgrade — 27 October 2026

## Latency fix (latest implementation)

The default OCR order is now DeepSeek first, Gemini second. The previous order could spend about 45 seconds waiting for Gemini before using the working DeepSeek path. `DOCUMENT_OCR_PRIMARY=gemini` remains available for deployments that need the reverse order. The primary DeepSeek model must support image input; the configured model did so in the live checks.

Each OCR attempt has a 20-second deadline for a single page, increasing by two seconds per additional page to a maximum of 34 seconds. The DeepSeek OCR client disables automatic retries. There is at most one fallback. Request cancellation stops the orchestration without starting another provider. This bounds OCR attempts; it is not a deadline for the entire upload, retrieval and answer workflow. Cancellation cannot guarantee that a remote provider has stopped billing a request already received.

Per-stage timings and OCR provider attempts are included in internal pipeline results and saved smoke-test reports, without recording document contents in timing logs. The smoke runner saves timestamped snapshots and exits with failure if a case fails.

Latest live check using the same synthetic fixtures:

| Case | Latest observed time | Result |
|---|---:|---|
| Text PDF | 2.29 s | Passed |
| Image | 3.60 s | Passed; DeepSeek OCR 0.92 s |
| Scanned PDF | 3.59 s | Passed; extraction and OCR 1.07 s |
| PDF plus legal retrieval | 8.11 s | Passed; includes retrieval-service initialization |

The user's preceding screenshot showed 49.66 seconds for the image and 42.39 seconds for the scan. This is an observed comparison across runs, not a controlled latency benchmark or a guarantee for dense documents. Numeric fact and page-reference checks passed for all three summaries; the legal case returned a retrieved citation. No image resolution, document character limit or output budget was reduced for this speed improvement.

Final regression suite: 71 tests ran, 67 passed, 4 optional Ragas tests skipped. Added checks cover skipping the fallback after primary success, cancellation of a slow primary before fallback, propagating request cancellation, and disabling automatic OCR retries. `git diff --check` passed. Restart the backend to load the changes; a deployed backend needs the updated code deployed as well.

The sections below describe the earlier implementation and its initial checks; the provider order above supersedes the earlier Gemini-first flow.

The upload endpoint now uses `app/services/document_pipeline.py`. It extracts selectable PDF text locally, reads scanned pages and images through OCR, and separates document interpretation from retrieved Philippine legal evidence. Answers can cite `[Document page N]` and `[Source N]`; law sources are returned to the existing mobile source display. Document classification is structured rather than inferred from English refusal phrases.

The response instructions support English, Filipino and Taglish, concise factual summaries, explicit reading limits, and uncertainty about legal conclusions. Uploaded text is treated as evidence rather than instructions. These are model instructions, not guarantees of semantic correctness or prompt-injection immunity.

## Limits and efficiency

- At most 20 PDF pages, 8 pages requiring OCR, 24,000 document characters and 10 MB per upload.
- Text PDFs avoid vision calls. Summaries can skip law retrieval. History and output lengths are bounded.
- PDFs requiring OCR send only those pages to Gemini. If it fails, those pages are rendered locally with pypdfium2 and sent to the configured DeepSeek model as images. There is one fallback, not an unlimited retry loop.
- The configured `deepseek-chat` alias returned `deepseek-flash` and successfully transcribed the synthetic image and scan in this environment. Other deployments must use a vision-capable model for this fallback.
- Gemini 2.0 Flash returned a retired-model error. The default, example environment and local environment now use Gemini 3.8 Flash, as recommended by the provider error and listed in [Google's model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash). This provider returned demand-related errors during testing; the fallback completed the checks.
- Install updated backend requirements before deployment. New runtime dependencies: pypdfium2 and Pillow. Local dependencies were installed. No production deployment was performed.

## Verification

`python -m unittest discover -s tests`: 67 tests ran, 63 passed, 4 optional Ragas tests skipped. Twelve document tests cover malformed/encrypted/oversized PDFs, page numbering, context limits, selectable-PDF OCR bypass, nonlegal classification, unavailable citations, unreadable input, and provider fallback failure/success. `git diff --check` passed.

`python -m scripts.document_smoke` exercised four synthetic cases through real configured providers:

| Case | Result | Observed time |
|---|---|---:|
| Selectable PDF, English summary | Correct rent, deposit, term and page reference | 2.58 s |
| PNG, Filipino summary | Correct amounts/dates and page reference, fallback OCR | 8.02 s |
| Scanned PDF, Taglish explanation | Correct amounts/dates and page reference, fallback OCR | 8.05 s |
| PDF plus RA 8792 Section 6 question | Retrieved law and returned source citation | 10.05 s |

After tightening the prompt for brevity and unsupported legal examples, the law case was rerun successfully in 8.52 seconds (`python -m scripts.document_smoke --law-only`). The first three live checks preceded that final prompt refinement. Local ignored results are in `evaluation/runs/document-smoke.json` and `document-law-smoke.json`. The runner now asserts expected numeric facts/page references for summaries and a retrieved citation for the legal case.

These are smoke checks, not a held-out accuracy evaluation, a pricing benchmark, or evidence of flagship-level equivalence. The legal response still mentioned examples of issues outside the retrieved provision while describing them as unverified; semantic grounding remains something to evaluate on a larger document set. Poor handwriting, dense tables, mixed image/text pages, long documents and authenticated mobile/database flows were not comprehensively tested. OCR transcription and legal interpretation can still be wrong. The user is handling independent human review.
