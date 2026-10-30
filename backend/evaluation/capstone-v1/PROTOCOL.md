# Capstone evaluation protocol

Status: frozen first-use test; source-backed assistant drafts, NOT expert-reviewed ground truth.

Update, 27 October 2026: the user subsequently requested app improvements based on the findings. This set is now development data for the improved app. Preserve the original first-use report; label subsequent scoring with `--development`. The dataset and original results remain unchanged. A separate unexposed test is needed to assess the improved app's generalization.

## Design and scope

The set contains 36 prompts: 12 English, 12 Filipino, and 12 Taglish. Eighteen source-answer prompts cover six issues translated into all three languages; six follow-ups revisit those issues with user-only history; four prompts require clarification, four require acknowledging unavailable information, and four require refusal. There are 18 distinct families, not 36 independent legal issues. The scope is text-only Philippine legal information, not legal representation, current-law certification, document image recognition, or a complete mobile/API acceptance test.

Questions and draft labels were constructed before querying the app. The manifest records the freeze timestamp, exact dataset SHA-256, source document hashes, and development-set hashes. Exact question overlap with starter/generated-50 is zero; the three named source documents do not occur among the 20 generated-50 source documents. Topic/semantic overlap with all previous development is not ruled out. RAG source documents are expected to exist in the retrieval corpus: holding out test questions does not mean withholding the laws the system should search.

References were checked against these official statutory pages on 27 October 2026:

- [RA 8792, Sections 6 and 8](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/3888)
- [RA 11058, Sections 6 and 8](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/86355)
- [RA 10931, Sections 4 and 6](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/78458)

This checks the named statutory text, not all amendments, implementing rules, later decisions, or personal eligibility as of today. Most factual prompts explicitly ask what a named section says to keep the assessed claim bounded. Draft passage labels use exact indexed URLs and short verbatim substrings. A matching anchor alone does not demonstrate that every condition needed for the answer was retrieved. A reviewer must assess whether additional passages should be labeled.

## Freeze and first-use run

From `backend`:

```powershell
.\venv\Scripts\python.exe -m scripts.capstone_eval verify
.\venv\Scripts\python.exe -m scripts.evaluate --dataset evaluation/capstone-v1/test.jsonl --output evaluation/runs/capstone-v1/answers
# Pass the exact results.jsonl path printed by that run:
.\venv\Scripts\python.exe -m scripts.capstone_eval score --results evaluation/runs/capstone-v1/answers/RUN_ID/results.jsonl
```

Do not rerun the first-use evaluation silently and select a better result. Retain failures, evaluator errors, original runs, and all denominators. Repeated measurements are allowed for a declared variability study, with all runs retained and reported. Do not change the app, prompts, index, or labels to improve this test. Once findings guide optimization, it becomes development data and a new held-out set is needed for the changed app.

The pipeline runner records generator model/temperature, source hashes, query rewriting, retrieval settings, answers, full retrieved chunks and exact supplied context. It does not create Supabase chats. Follow-up fixtures supply earlier user topics, without injecting assistant claims; they test reference resolution, not the entire real chat lifecycle. An index name is not an immutable index snapshot; record/export one separately if available. Local timestamps in generated run paths are UTC; the evaluation date in this protocol is Asia/Manila.

## Automated measures

- Passage hit rate, precision and recall: exact URL plus required short-passage match, based on UNREVIEWED labels. Cases without labels are unscored. Sparse labels can underestimate precision; incomplete anchors can overstate complete-answer coverage.
- Citation identifier validity: whether cited source numbers exist. This is separate from claim support.
- Provisional rubric estimates: expected behavior, language match, draft-reference agreement, evidence faithfulness, citation support, and material-error flags. Scores are model judgments, not independent legal accuracy. The rubric is archived with each run.
- Provisional acceptable response: expected behavior and language pass, no critical-error flag, and at least 0.8 draft-reference agreement for answer cases. The threshold is a predeclared inspection aid, not a validated clinical/legal or capstone pass standard.
- Report execution failures, empty retrieval, means AND scored-case counts by language/category. Lower critical-error rates are better. Do not compare these scores directly to Ragas on generated-50: both the questions and scoring method differ.

By default the configured DeepSeek model grades the app. Setting EVAL_API_KEY, EVAL_MODEL and EVAL_BASE_URL can use a different compatible evaluator. Neither a different model nor agreement between models replaces qualified human review. Failures and skipped metrics stay visible.

## Human reference review — still pending

1. Recruit a Philippine lawyer, legal educator, or adviser with relevant legal expertise; record their role and qualifications. A general technical adviser can assess methodology but should not be represented as verifying legal correctness without appropriate expertise. Arrange a fluent Filipino/Taglish wording review too. Prefer two independent reviewers when feasible; disclose when only one is available.
2. Give the reviewer REVIEW_PACKET.md and reference_reviews.template.jsonl first. Withhold app answers and automated scores during answer-key validation. Check the statutory text and version, qualifications/exceptions, scope, source URLs, full evidence requirements, reference answer, expected behavior, translation equivalence, and whether prompts are sufficiently clear.
3. Save completed reviews as a separate file; never replace the template or change frozen v1. Record name, qualifications, date, decision, verification fields and corrections. Approval means the reviewer actually checked the entry. Do not auto-fill approvals or change reviewed:false based on an AI score.
4. Corrected/excluded cases require a new version of the key with change reasons. Preserve the original question set, first-use outputs, and original key; disclose how many cases changed and why. Do not remove difficult valid questions to improve scores. If a question itself changes, it is a new test item, not a retroactive correction of the old answer.

## Human response review — still pending

After reference-key review, give the reviewer HUMAN_RESPONSE_PACKET.md and human_ratings.template.jsonl from the scored run. These packets omit automated scores and randomize case order. Use the approved reference packet alongside them. A second reviewer should work independently before discussion.

Rate each applicable dimension on 0=unacceptable, 1=partial, 2=acceptable: legal correctness, completeness, evidence support, citation support, language clarity, appropriate behavior. Null means genuinely inapplicable, not missing effort. Record a separate critical-error flag and explanation. A correct answer from model memory can still fail evidence support; a cautious justified refusal can pass behavior without receiving a factual-answer score. Missing required evidence can explain an error without excusing an incorrect answer.

Report the number reviewed and applicable denominators for each dimension. For answer cases, report fully correct / legally reviewed answer cases and partial cases separately. For refusal/clarification/abstention, report appropriate behavior separately. If using two reviewers, report pre-adjudication agreement (and a suitable statistic such as weighted Cohen's kappa for ordinal ratings), then adjudicate disagreements with recorded reasons. Do not treat translations as independent samples when reporting uncertainty.

## Suggested reviewer request

> I am evaluating a Philippine legal information RAG assistant for my capstone. Could you review a small frozen test set before seeing its answers, checking the legal references and conditions, then independently assess the saved responses? The packet has 36 prompts covering 18 families, including English, Filipino/Taglish and cases that should clarify or decline. I will record your qualifications, corrections and assessment date, and report AI-based and human findings separately. I am not asking you to endorse the app or certify it as a substitute for legal advice.

Do not send this request or disclose project data to anyone without choosing and authorizing the recipient yourself.

## Presentation wording before human review

> We evaluated a fixed first-use test set of 36 prompts across English, Filipino and Taglish, representing 18 question families. The evaluation included source-based answers, follow-up resolution, clarification, abstention and refusal. Questions were frozen before the test and the app was not tuned using its results. Legal answer keys and automatic grades remain provisional pending qualified human review. These findings measure the tested behaviors and evidence use; they do not establish general legal accuracy.

After real human review, replace the pending-review sentence with the actual reviewer qualifications, number of cases reviewed, review date, agreement/adjudication method, and human score denominators. Do not claim a deployment-quality guarantee or a representative Philippine-law benchmark from this small purposive set.

## Retaining artifacts

The frozen dataset, manifest, reference packet and this protocol can be versioned. Full answer/scoring runs live under ignored evaluation/runs/; export them separately with the capstone submission. Keep secrets out of exports. Preserve model settings, source hashes, evaluator rubric, original and reviewed keys, completed human ratings and all run reports.
