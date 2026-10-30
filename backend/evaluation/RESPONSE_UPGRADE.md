# Response quality and efficiency upgrade — 27 October 2026

Implemented and tested in the local backend. These are provisional development results from the same 36 prompts, with unchanged questions, labels and evaluator rubric. The original first-use results remain preserved. The improvements do not establish flagship-model equivalence or expert-verified legal accuracy.

Measure | Before | Final
--- | ---: | ---:
Combined response criteria | 24/36 (66.7%) | 34/36 (94.4%)
Expected behavior | 27/36 (75.0%) | 36/36 (100.0%)
Requested language (frozen labels) | 30/36 (83.3%) | 35/36 (97.2%)
Required passage found | 18/24 (75.0%) | 24/24 (100.0%)
Mean latency | 6.50s | 3.24s
Median latency | 4.42s | 3.40s
Execution/judge failures | 0/36 | 0/36

## What changed

- A compact planner combines intent detection and search rewriting. Legal ambiguity prompts a targeted question; an unseen private document prompts a request for its text. Clear out-of-scope and fabrication requests receive a specific refusal in the user's language. These non-substantive replies avoid retrieval and a second model call.
- Explicit law-and-section questions skip paid rewriting. Retrieval searches within that law, locates the requested section, joins consecutive indexed chunks, and stops at the next section. It handles scraped headings glued to prior text, checks fetched URL/title/category/index identity, and marks unrecovered continuations rather than silently bridging missing text. Expansion is bounded to five consecutive chunks and 8,000 characters per section; no reindex is required.
- Follow-up law/section identities come from user history, never an assistant's invented authority or an unvalidated rewritten law number. A new explicit law takes priority; a new section replaces the prior section for that follow-up.
- The shorter answer instructions emphasize a direct response, natural language matching, all material conditions, claim-supporting citations and specific uncertainty. They remove the fixed English refusal template.
- Model history is capped at 12 messages/12,000 characters, with at most 4,000 characters per message. The API loads only the latest 12 messages. Older context may need to be restated. Chat titles are generated locally with no model call.
- Evaluation records provider-reported input/output/cache tokens, returned model IDs, call stages, timing and section spans. No cross-user answer cache or reference-answer lookup was introduced.

## Cost and latency evidence

The old pipeline makes one rewrite and one generation call per prompt: 72 logical calls for these 36 cases. The final run recorded 42 successful model responses (41.7% fewer). This comparison excludes evaluator calls, hidden SDK retries, embeddings, Pinecone requests and the old extra title call on a new API chat. It is a call-count reduction, not an audited percentage reduction in the total bill.

- Provider-reported prompt_tokens: 29,703 total; 825.1 per question.
- Provider-reported completion_tokens: 6,734 total; 187.1 per question.
- Provider-reported prompt_cache_hit_tokens: 20,860 total; 579.4 per question.

Configured alias: deepseek-chat. Returned model IDs observed: deepseek-flash. The provider/model configuration was retained; original runs did not record the served model ID. Model aliases are not immutable versions. No exact dollar saving is claimed without provider invoices and baseline token telemetry.

The final mean is about half the baseline mean, but this is a small run and not a latency SLA. The additional 12-question check had a 75.3-second response; the 45-second provider read timeout and one retry do not imply a 45-second total deadline. All latencies are retained. Additional metadata/neighbor fetches can add retrieval work even while model input shrinks.

## Quality checks and remaining limitations

- Regression suite: 55 tests ran, 51 passed and four optional Ragas tests were skipped. Checks include routing fallback, bounded history, avoiding assistant-derived law identities, exact-overlap preservation, missing-chunk gaps, source-ID collisions, concatenated headings, and frozen-data/report safeguards. Whitespace checks passed.
- All 36 final pipeline cases and all 36 judge assessments completed. The frozen dataset and rubric hashes match the baseline. Final source hashes were checked against the local files when this report was generated.
- Twelve additional, previously unrun prompts about different provisions/behaviors scored 12/12 on the combined criteria on the preceding implementation, before the concatenated-heading repair. They use the same three laws and unreviewed references; they are a small additional check, not a representative or document-disjoint legal benchmark. Their original results are retained rather than relabeled as a final-build run.
- The remaining frozen-key flags are cap-followup-01 (the rubric asks for PPE approval/use details although the actual follow-up asks who pays) and cap-refuse-12 (an English prompt has a Taglish expected-language label). A human reviewer should decide corrections in a separately versioned key. The raw 34/36 score is retained; no cases were removed or silently relabeled.
- Passage recall/hit rate uses short draft anchors. Final evidence units can contain a reconstructed section rather than a single chunk, so raw precision across the two retrieval granularities is not a like-for-like quality claim. Exact anchor matches do not establish complete answer coverage or current legal validity.
- The judge shares the generator's configured provider/model; grades and reference answers remain provisional. Twenty-four factual/follow-up prompts reuse six issue families in translations, plus twelve behavioral families. No population confidence or independently verified legal accuracy is claimed.
- This work improves text chat. Authenticated mobile/Supabase behavior, uploaded-image analysis, current legal status and long-session memory beyond the bound still require separate validation. Streaming was not added, and no production deployment was performed.

## Inspect the evidence

- [Final quality report](runs/response-upgrade/final-scored/20261027T025049162154Z/REPORT.md)
- [Final answers, evidence and token usage](runs/response-upgrade/final-answers/20261027T025027078237Z/results.jsonl)
- [Original baseline report](runs/capstone-v1/scored/20261027T014649135354Z/REPORT.md)
- [Intermediate improvement report](runs/response-upgrade/scored/20261027T024432200308Z/REPORT.md)
- [Additional-question report, preceding build](runs/response-upgrade/additional-scored/20261027T024445769621Z/REPORT.md)
- [Human-review protocol](capstone-v1/PROTOCOL.md)

Restart the backend to use the changes if auto-reload is disabled. There are no new provider keys, packages, database migrations or index rebuilds. Keep these cases as development data for the revised app; obtain a new independent held-out set and qualified legal review before stronger presentation claims.
