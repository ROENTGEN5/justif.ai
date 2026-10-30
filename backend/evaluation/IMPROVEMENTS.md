# Evaluation improvements — 26 October 2026

The app now uses broader candidate retrieval, local relevance ranking, and consistent evidence rules. The final two-question comparison improved average Ragas faithfulness from **0.776 to 0.891**. This is a small development-set result, not a benchmark of overall legal accuracy.

| Same baseline question | Before | Final |
|---|---:|---:|
| English privacy question | 0.839 | 0.900 |
| Filipino privacy question | 0.714 | 0.882 |
| Mean | 0.776 | 0.891 |

Both runs used Ragas 0.4.3 with the same configured DeepSeek judge and an 8,192-token evaluator output budget. Reference answers were not supplied, so these are grounding scores only. Mean app latency on this pair was 7.90 seconds before and 7.22 seconds after; this single timing comparison is not a performance guarantee.

## Changes applied

- Retrieve 40 candidates for a five-passage answer, then combine semantic similarity with a small local BM25 relevance contribution. Remove identical passage bodies and demote dense tables of contents. No index rebuild or extra external reranking service is needed.
- Identify sources by URL, with title/date fallback, so different documents with the same title do not share the wrong citation number.
- Rewrite questions into focused search phrases with useful legal synonyms and preserve recent user facts for follow-ups. Previous assistant claims are excluded from query rewriting.
- Retrieve fresh evidence on every turn. A first question containing “what should I do” no longer bypasses retrieval.
- Replace mandatory remedy/penalty templates and blanket legal conclusions with evidence-based instructions, explicit uncertainty, preserved exceptions and lower generation temperature (0.1).
- Use one shared pipeline for chat and evaluation. Retrieval outages raise a service error (HTTP 503) instead of producing an answer without evidence. Legitimate domain refusals are no longer counted as generator failures.
- Record source-file hashes with runs so results can be tied to a code snapshot.

## Verification

- 26 backend/offline tests passed; the optional Ragas integration test passed separately in its evaluation environment (27 total).
- All ten starter cases completed without execution errors on the final code snapshot. This includes a first-message follow-up phrase, a genuine follow-up, non-legal content, an unavailable private document and a fabrication request.
- Inspected the responses: the non-legal request and fabrication request were refused; the missing-document request acknowledged that the document was unavailable. Some responses still contain unnecessary adjacent legal information, so useful-answer review remains necessary.
- The final search rewrite retrieved relevant Civil Code lease material and Labor Code-related material for the rental and employment cases. These cases were smoke-tested and inspected, not given validated correctness scores.
- Syntax checks and `git diff --check` passed. The full authenticated mobile/Supabase flow was not exercised; its route now calls the tested shared pipeline.

## Saved reports

- [Original two-case scores](runs/ragas/20261026T100508832824Z/report.md)
- [Final two-case scores](runs/query-refined-ragas/20261026T125218328215Z/report.md)
- [Final ten-case smoke report](runs/validated-final/report.md)
- [Final ten-case answers and evidence](runs/validated-final/results.jsonl)

Run artifacts are ignored by Git. Retain/export them separately when sharing this comparison.

## Limits and next validation

Intermediate changes did not consistently improve the privacy pair; the final query rewrite was important. The two baseline questions were used during development, so improvements must be tested on a held-out reviewed dataset before generalizing. Do not adjust the judge or label unreviewed references as reviewed to make scores look better.

Faithfulness is not legal correctness or usefulness. The corpus still includes historical/amended provisions and partial chunks. These changes do not verify current legal status, complete every provision, or remove all irrelevant material. Expert-reviewed references, current-source/version metadata and broader English/Filipino/Taglish testing are still required for a defensible capstone accuracy claim.

Restart the backend to load the changes (or let `uvicorn --reload` pick them up). No Pinecone reindex is required.
