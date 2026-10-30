# Named-law retrieval and focused answers

Applied and checked on six existing cases from the 50-question development run. These are development comparisons against synthetic reference answers, not independent legal accuracy measurements.

## What changed

- Recognizes explicit Republic Act, Presidential Decree, Executive Order, Batas Pambansa and Commonwealth Act identifiers and common abbreviations.
- Uses the original user question to construct an exact short-title metadata filter. An invented or changed identifier in the rewritten query cannot redirect that lookup.
- Searches within the requested law rather than substituting semantically similar laws. A missing match produces an evidence gap instead of unrelated legal material.
- Preserves user category filters and gives multiple named laws a share of the context budget. Implementing rules are distinguished when explicitly requested.
- Requests one-to-three-sentence answers for specific facts, focused bullets for broader questions, and relevant conditions only. Historical questions no longer require a blanket discussion of current applicability.

## Same six-case comparison

Metric | Before | After
--- | ---: | ---:
faithfulness | 0.764 | 0.826
synthetic_context_recall | 0.544 | 0.944
synthetic_factual_correctness | 0.308 | 0.467
Average answer length (words) | 225 | 186

The previously unanswered RA 9507 enactment question now retrieves RA 9507, including its enactment text. RA 649 and RA 1996 questions retrieve only those named laws in this test. All six live cases completed without execution failures. 32 backend regression tests passed; four optional Ragas tests were skipped in the backend-only environment. Syntax and whitespace checks passed.

## Inspect results

- [Six-case scores](runs/named-law-check/scores/20261026T141122980365Z/report.md)
- [Six-case answers and evidence](runs/named-law-check/answers/20261026T140839729049Z/results.jsonl)

## Limits

This does not update the original 50-case report. Rerun the same 50 questions to measure the full effect. The answer style is an instruction, not a hard word-count guarantee. Current-law accuracy remains unverified. Exact lookup depends on matching stored short-title variants; other identifiers and unusual titles still require additional alias support. Executive order numbers can recur across years, so number matching alone does not establish the intended edition. Synthetic reference scores remain provisional and individual grades can be noisy.

No index rebuild is required. The running backend uses auto-reload; otherwise restart it to load the code changes.
