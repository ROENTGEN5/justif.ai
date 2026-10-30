"""Freeze additional, previously unrun provisions/questions before their first run."""
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parent
target = root / "response-check-v1"
if target.exists():
    raise SystemExit("Preserve the existing frozen additional check")
documents = json.loads((root / "capstone-v1/source_documents.json").read_text(encoding="utf-8"))
by_id = {d["url"].split("/")[-1]: d for d in documents}
specs = [
    ("en", "3888", 12, "What factors does Section 12 of RA 8792 say should be considered when assessing the evidential weight of an electronic document?",
     "Reliability of how it was generated, stored or communicated; reliability of identification of its originator; and other relevant factors.",
     "the reliability of the manner in which it was generated, stored or communicated"),
    ("en", "3888", 16, "Under Section 16 of RA 8792, can offer and acceptance be expressed through electronic messages, and what qualification does the first sentence include?",
     "Yes, except as otherwise agreed by the parties. Existing legal elements of contract formation still apply; electronic form alone is not grounds to deny validity or enforceability.",
     "Except as otherwise agreed by the parties, an offer, the acceptance of an offer"),
    ("fil", "86355", 2, "Sa Seksyon 2 ng RA 11058, kasama ba ang mga establisimyento sa PEZA, at ano ang sinasabi nito tungkol sa pampublikong sektor?",
     "The coverage expressly includes PEZA establishments but excludes the public sector. Do not claim the public sector has no safety obligations under any other law.",
     "except in the public sector"),
    ("fil", "86355", 5, "Ano ang kailangang ipaalam at anong pagsasanay o oryentasyon ang dapat maibigay sa manggagawa ayon sa Seksyon 5 ng RA 11058?",
     "Workers must be informed of workplace hazards and given access to chemical-safety training/education and orientation on chemical safety data sheets, electrical, mechanical and ergonomical safety.",
     "All workers shall be appropriately informed by the employer about all types of hazards in the workplace"),
    ("taglish", "86355", 7, "Under Section 7 ng RA 11058, kanino puwedeng mag-report ng accidents at hazards ang workers at representatives nila?",
     "To the employer, DOLE, and other concerned government agencies exercising jurisdiction as competent authority in that industry or economic activity.",
     "to the employer, to the DOLE and to other concerned government agencies"),
    ("taglish", "86355", 9, "Under Section 9 ng RA 11058, saan dapat ilagay ang safety signs at anong language ang dapat gamitin?",
     "In prominent positions at strategic locations, in a language understandable to all, following DOLE standards.",
     "in prominent positions at strategic locations in a language understandable to all"),
    ("en", "78458", 7, "According to Section 7 of RA 10931, may the tertiary education subsidy cover room and board, and what limits the amount of subsidy?",
     "It may include a room-and-board allowance. The amount is based on UniFAST Board guidelines and annual budgetary appropriation; do not promise an unlimited or individually guaranteed benefit.",
     "An allowance for room and board costs incurred by the student"),
    ("fil", "78458", 8, "Ayon sa Seksyon 8 ng RA 10931, kailan magsisimula ang pagbabayad ng pautang? Sapat na bang sabihin na agad ito pagkatapos ng graduation?",
     "Repayment commences once the beneficiary obtains gainful employment with earnings reaching the Compulsory Repayment Threshold, which the UniFAST Board sets and reviews. Graduation alone is not the trigger stated in this section.",
     "earnings that reaches the Compulsory Repayment Threshold (CRT)"),
]
rows = []
for i, (language, doc_id, number, question, reference, passage) in enumerate(specs, 1):
    document = by_id[doc_id]
    text = document["text"]
    start = re.search(rf"SEC\. {number}\.\s", text, re.I)
    end = re.search(rf"SEC\. {number + 1}\.\s", text[start.end():], re.I)
    assert passage in text
    rows.append(dict(id=f"check-{i:02}", family_id=f"new-provision-{i:02}", category="source_answer",
        language=language, question=question, expected_behavior="answer", reviewed=False,
        reference_origin="assistant_draft_source_checked", reference_answer=reference,
        reference_contexts=[text[start.start():start.end()+end.start()]],
        expected_evidence=[{"url": document["url"], "text_contains": passage}],
        required_points=[reference], forbidden_claims=["Do not invent exceptions or guaranteed outcomes."], history=[]))
extra = [
    ("taglish", "clarify", "May legal problem ako sa school pero di ko pa nasasabi ang nangyari. Ano ang first details na kailangan mong malaman?", "Ask what happened and who or which school policy is involved before selecting a legal remedy."),
    ("taglish", "missing", "Ano ang exact last paragraph ng demand letter na natanggap ko? Hindi ko pa pinapakita ang letter.", "Acknowledge the unseen letter cannot be quoted and ask for its last paragraph; do not invent its contents."),
    ("en", "refuse", "Make a seven-day vegetarian meal plan. This has nothing to do with a legal matter.", "Briefly redirect to legal scope without producing a meal plan."),
    ("fil", "clarify", "May parusa ba rito? Hindi ko pa naipapaliwanag ang pangyayari o kung anong ginawa.", "Magtanong tungkol sa nangyari at ginawa; huwag mag-imbento ng paglabag o parusa."),
]
for i, (language, kind, question, criterion) in enumerate(extra, 9):
    behavior = "abstain" if kind == "missing" else kind
    rows.append(dict(id=f"check-{i:02}", family_id=f"new-behavior-{i:02}", category=behavior,
        language=language, question=question, expected_behavior=behavior, reviewed=False,
        reference_origin="assistant_draft_behavior_rubric", reference_answer=None, expected_evidence=[],
        required_points=[criterion], forbidden_claims=["Do not invent facts or substantive legal rules."], history=[]))
assert Counter(r["language"] for r in rows) == {"en": 4, "fil": 4, "taglish": 4}
old_questions = {json.loads(line)["question"] for line in (root / "capstone-v1/test.jsonl").read_text(encoding="utf-8").splitlines()}
assert not old_questions.intersection(r["question"] for r in rows)
target.mkdir()
dataset = target / "test.jsonl"
dataset.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
(target / "source_documents.json").write_text(json.dumps(documents, ensure_ascii=False), encoding="utf-8")
manifest = dict(total=len(rows), family_count=12, language_counts=dict(Counter(r["language"] for r in rows)),
    frozen_at=datetime.now(timezone.utc).isoformat(), dataset_sha256=hashlib.sha256(dataset.read_bytes()).hexdigest(),
    source_documents=[dict(url=d["url"], corpus_sha256=hashlib.sha256(d["text"].encode()).hexdigest()) for d in documents],
    limitations="Small unreviewed additional check using new provisions/questions in the same three laws; not a representative or document-disjoint legal benchmark.")
(target / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"Frozen {len(rows)} additional cases: {dataset}")
