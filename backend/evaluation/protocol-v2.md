# Evaluation preparation protocol

Status: implementation in progress; independent evaluation and human review pending.

Use existing starter/capstone-v1 cases for development only. Do not use a new held-out set to debug the runner. Freeze the candidate build and reviewed references before first held-out execution. Preserve every failure, run and key correction.

From backend:

```powershell
.\venv\Scripts\python.exe -m unittest discover -s tests
.\venv\Scripts\python.exe -m scripts.evaluation_snapshot
.\venv\Scripts\python.exe -m scripts.evaluate --validate-only
# Requires a running backend and JUSTIFAI_EVAL_TOKEN for a dedicated test account:
.\venv\Scripts\python.exe -m scripts.evaluate --mode stream-api --limit 2
```

Streaming evaluation creates real chats. It never automatically retries a failed submission. Total case latency includes prior turns; first-answer latency measures the final question only. Status events are excluded. Partial answers and missing completion events are failures. API mode does not expose retrieved context; grounding scores remain unavailable. Pipeline and API runs are distinct observations.

Archive the baseline source ZIP and manifest with run artifacts; the runs directory is Git-ignored. Record deployed backend and mobile identifiers separately. Local source hashes do not identify a remote deployment. Index snapshots are currently an explicit missing field.

Complete mobile-acceptance.csv on the target device with two disposable accounts. Record failures and evidence; pending is not passing. Cross-account access, silent data loss or unrecoverable crashes block participant testing.

Prepare 45 fresh text cases across English, Filipino and Taglish and 12 document fixtures following EVALUATION_IMPLEMENTATION_PLAN.md. Draft keys must remain unreviewed until a qualified reviewer actually checks them. Legal correctness and current applicability require checked references. Obtain score-blind response ratings after reference review. Human review, participant recruitment and user observations cannot be replaced by generated ratings.

Report counts and failures alongside every average. Median/p95/max in summary.json use available observations including errors; small-sample p95 is descriptive. Report legal correctness, completeness, evidence, citation support, behavior, language and document facts separately. No legal pass threshold has been validated.
