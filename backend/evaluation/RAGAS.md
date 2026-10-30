# Ragas: simple steps

All commands below run from your `backend` folder. Ragas is installed separately in `.venv-ragas`; your app uses its existing Python environment.

## Start here: grade the answers you already generated

This uses the existing DeepSeek key in `backend/.env`. You can use a separate evaluator by setting `EVAL_API_KEY`, `EVAL_MODEL`, and optionally `EVAL_BASE_URL` instead. Reusing DeepSeek means it is grading its own model's answers; treat the scores as estimates.

```powershell
$results = (Get-ChildItem evaluation/runs/*/results.jsonl | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
.venv-ragas/Scripts/python.exe -m scripts.ragas_eval score --results "$results" --preview
.venv-ragas/Scripts/python.exe -m scripts.ragas_eval score --results "$results"
```

The preview makes no API calls. The second command makes evaluator calls, but does not rerun your chatbot. Open the new `report.md` in the printed folder. `ragas_faithfulness` measures how well the answer is supported by the context actually supplied. A high score is not proof of legal correctness. Your current starter cases can receive this score without any manual answer key.

The scorer reserves up to 8,192 output tokens per evaluator response so longer claim-by-claim judgments can finish. If it reports a truncated response, retry with `--max-tokens 16384` (if supported by your provider). This raises the possible evaluation cost; it does not change your app's answer length. Full errors are saved in the results file; the terminal shows a short explanation.

## Automatically make a draft answer key

```powershell
.venv-ragas/Scripts/python.exe -m scripts.ragas_eval generate --preview
.venv-ragas/Scripts/python.exe -m scripts.ragas_eval generate --size 10 --documents 5
```

The second command uses Ragas to generate questions and expected answers from a seeded sample of your laws CSV. It uses DeepSeek for generation and your Nomic key (or local Ollama `nomic-embed-text`) for embeddings. It makes multiple API calls and can take several minutes. Default sampling includes complete laws with 2,000–30,000 characters to keep the first experiment manageable; it is not representative of your entire legal corpus. Generation defaults to single-hop questions; it does not cover refusals, adversarial or conversational behavior, so keep the starter cases too. The seed controls document sampling only; generated questions can vary.

The result is `evaluation/generated.jsonl`. Draft answers keep `reviewed: false`. `reference_contexts` retains the passages Ragas used; `generated.sources.json` records source URLs and document hashes. Generation does not fabricate exact URL/passage labels for the existing runner's `expected_evidence` field. To get exact-match retrieval metrics, label those separately after review. Generated data may follow source language and needs language review for Filipino/Taglish coverage.

Generation uses complete sampled documents with consistent summary, entity and theme extraction. This avoids Ragas 0.4.3's default heading-splitting failure on mixed short/long documents (`'headlines' property not found`). The size limit on sampled documents keeps complete-document prompts bounded; generated references still need review against the full source. The manifest records the preprocessing version used.

All generation stages share one event loop so Windows HTTP connections are not reused after their loop closes. Prepared documents are cached under `evaluation/runs/generation-cache/`, keyed by source hashes, model, provider URL and preprocessing version. If a later generation stage fails, rerunning the same command can reuse this preparation. Changing the source documents or generation configuration selects a different cache; the final question dataset is never silently overwritten.

## Ask your app the generated questions

Use your **normal backend Python**, the same one you used successfully before:

```powershell
python -m scripts.evaluate --dataset evaluation/generated.jsonl --validate-only
python -m scripts.evaluate --dataset evaluation/generated.jsonl --limit 2
```

## Grade those results with Ragas

```powershell
$results = (Get-ChildItem evaluation/runs/*/results.jsonl | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
.venv-ragas/Scripts/python.exe -m scripts.ragas_eval score --results "$results" --allow-synthetic
```

`--allow-synthetic` lets Ragas compare against its generated, unreviewed answer keys. These scores are explicitly named `synthetic_factual_correctness` and `synthetic_context_recall`. They measure agreement with AI-generated references, not independently verified correctness. Without that flag, reference-based scoring requires `reviewed: true`. Context recall asks whether retrieved context supports the reference answer; it differs from the exact passage recall in the original runner. API runs cannot receive context-based scores because the endpoint does not expose its context. Skipped metrics are not zeros; metric failures are recorded and produce a nonzero exit code. No eligible scores also produces a nonzero exit code.

Check some generated questions/answers and low-scoring cases manually before relying on aggregate results. Keep the generated dataset fixed when comparing app changes.

## Reinstall on another machine

```powershell
python -m venv .venv-ragas
.venv-ragas/Scripts/python.exe -m pip install -r requirements-eval.txt
```

Ragas is pinned to 0.4.3. Provider keys are loaded from `.env` or environment variables and are never written into reports. Scoring/generation sends the selected text to your configured providers. Reports stay under ignored `evaluation/runs/`; generated datasets are ordinary files you can review and version.

Official references: [metrics](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/), [test generation](https://docs.ragas.io/en/stable/getstarted/rag_testset_generation/).
