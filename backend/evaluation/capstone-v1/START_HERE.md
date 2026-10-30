# Your capstone evaluation materials

The app was subsequently improved using these findings. See [the response upgrade comparison](../RESPONSE_UPGRADE.md) for current results. The figures below preserve the original first-use evaluation; this set is now development data for the revised app.

Completed on 27 October 2026 (Asia/Manila). Qualified human legal review is still pending.

## What was completed

- Froze 36 new prompts before querying the app: 12 English, 12 Filipino and 12 Taglish, representing 18 question families.
- Included 18 factual questions, six contextual follow-ups, four clarification cases, four abstention cases and four refusals.
- Prepared source-linked draft answers, required points, prohibited claims, exact indexed passage anchors, archived statutory text and a dataset hash.
- Verified zero exact question overlap with starter/generated-50 and no source-document overlap with generated-50's reference documents. Broader topic independence is not established.
- Ran all 36 prompts once against the unchanged app. All five app source hashes matched the previous app snapshot. No execution failures occurred.
- Scored saved answers with a fixed explicit rubric and preserved all judgments. A Windows console encoding failure interrupted printing; 32 saved judgments were recovered and the remaining four were assessed. No app answers were rerun, and no completed judgments were selectively replaced.
- Produced separate reference-review and score-blind response-review packets. No reviewer approvals or human scores have been fabricated.

## Results you can report as provisional automated findings

Measure | Result | Denominator
--- | ---: | ---:
Expected behavior | 27/36 (75.0%) | All prompts
Requested language | 30/36 (83.3%) | All prompts
Combined response criteria | 24/36 (66.7%) | All prompts
Required passage retrieved | 18/24 (75.0%) | Source-answer and follow-up prompts
Draft-reference agreement | 0.817 mean | 24 answer/follow-up prompts
Evidence faithfulness | 0.943 mean | 29 responses with scorable claims/context
Citation support | 0.930 mean | 27 responses with scorable citations/context
Average response latency | 6.50 seconds | 36 prompts; includes a 66.7-second response

The combined response measure requires behavior and language pass, no automated material-error flag, and draft-reference agreement of at least 0.8 for answer cases. This is a review aid, not a validated legal-quality acceptance threshold. Passage matching uses draft, incomplete anchors; it does not prove that all relevant conditions were retrieved. DeepSeek generated and judged answers. Do not label any of these figures “legal accuracy,” treat the absence of an automatic critical-error flag as proof of safety, or compare these scores directly with previous Ragas results from another dataset/rubric.

## Findings worth discussing

1. Some Filipino/Taglish legal questions were routed to the English “Legal Queries Only” template instead of asking for facts or acknowledging a missing document. Examples: cap-clarify-03, cap-abstain-06 and cap-abstain-08.
2. Retrieved context sometimes omitted the precise section needed, producing cautious but incomplete answers. Examples: cap-electronic-signature-en, cap-tuition-scope-en, cap-followup-03 and cap-followup-06.
3. High faithfulness does not guarantee a useful answer: a system may avoid unsupported claims while failing to answer the question. Report completeness/behavior and grounding separately.
4. Human review should examine the judge's strict distinction between a generic scope refusal and explicitly declining fabrication (cap-refuse-10), plus whether follow-up criteria inherited from a broader question demand unnecessary detail (especially cap-followup-01 and cap-followup-05). These are potential annotation/judging issues, not grounds to silently edit the frozen set or discard scores.

## Open these files

- [Full results, breakdowns and flagged cases](../runs/capstone-v1/scored/20261027T014649135354Z/REPORT.md)
- [Evaluation protocol and suggested reviewer request](PROTOCOL.md)
- [Reference key packet: give this to the qualified reviewer FIRST](REVIEW_PACKET.md)
- [Reference review form](reference_reviews.template.jsonl)
- [Response packet: give this AFTER reference-key review](../runs/capstone-v1/scored/20261027T014649135354Z/HUMAN_RESPONSE_PACKET.md)
- [Human response ratings form](../runs/capstone-v1/scored/20261027T014649135354Z/human_ratings.template.jsonl)
- [Frozen question set](test.jsonl)
- [Dataset/source manifest](manifest.json)

The full runs are ignored by Git; retain the submission ZIP or export the run folders with your capstone materials. The source snapshots in the ZIP are a reproducibility aid, not a complete deployable copy of the app. No credentials are included.

## What remains before claiming expert-validated results

Find a Philippine legal reviewer and a fluent Filipino/Taglish reviewer (one qualified person may cover both). Have them validate the key without seeing app answers first, then assess saved answers independently of automatic scores. Record qualifications, date, corrections, applicable case counts and disagreements. Follow PROTOCOL.md; preserve the frozen originals and version any corrections.

If these findings guide app fixes, call this set development data for the revised app and obtain a new held-out test before making final performance claims. The current run remains a valid record of this app snapshot's first exposure to these prompts.
