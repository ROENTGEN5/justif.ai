# Evaluating Justif.ai

Latest app improvements and measured before/after results: [RESPONSE_UPGRADE.md](RESPONSE_UPGRADE.md). The 36-case capstone set has now informed app changes and must be reported as development data for the revised app.

For the frozen multilingual capstone test, start with [capstone-v1/PROTOCOL.md](capstone-v1/PROTOCOL.md). It includes 36 new prompts, source-linked draft references, explicit behavior criteria and separate human-review packets. References remain unreviewed until a qualified reviewer checks them; automated results must not be presented as verified legal accuracy.

**Using Ragas? Start with the simpler [Ragas steps](RAGAS.md)** for automatic question generation and scoring of saved results.

Run commands from `backend` in your normal backend Python environment. Existing requirements cover the runner; no Ragas installation is required. The optional judge uses an OpenAI-compatible endpoint and an explicit rubric.

## 1. Check the starter dataset without API calls

```powershell
python -m scripts.evaluate --validate-only
```

The ten starter cases are **unreviewed examples**, not a legal benchmark. Review expected behaviors, fill in reference answers and evidence, and set `reviewed` to true after review. Correctness is deliberately unscored for unreviewed references.

Each JSONL line describes one independent case:

```json
{"id":"reviewed-case-1","question":"Your question","category":"privacy","language":"en","reviewed":true,"expected_behavior":"answer","reference_answer":"Expert-reviewed answer","expected_evidence":[{"url":"EXACT URL from indexed metadata","text_contains":"A distinctive verbatim supporting passage"}]}
```

Evidence matching requires BOTH the exact document URL and a case-insensitive, whitespace-normalized passage substring. Use short passages that fit inside a chunk. Each evidence entry is a required passage; recall is the proportion matched, precision is the proportion of returned chunks matching any entry, and hit rate records any match. Empty evidence means retrieval metrics are unavailable, not perfect. Incomplete labels can underestimate precision. These scores describe passage retrieval, not legal validity or document-level recall.

Use separate development and held-out datasets. Verify authoritative source versions and legal applicability when preparing references. Do not tune against the held-out set.

## 2. Run the pipeline

Configure the existing backend `.env` for DeepSeek, Pinecone and Nomic/Ollama, then:

```powershell
python -m scripts.evaluate --limit 2
python -m scripts.evaluate --dataset evaluation/starter.jsonl
python -m scripts.evaluate --top-k 10
python -m scripts.evaluate --no-rewrite
```

These commands make paid/service API calls. Pipeline mode uses the same shared chat pipeline as the API: query rewriting, retrieval, context formatting and generation. It does not write chats to Supabase. It captures full chunks, scores, URLs, chunk indexes, exact context, sources and answers. Retrieval expands the candidate pool (40 for top-k=5), removes identical passage bodies, demotes dense contents lists, and combines semantic scores with bounded local lexical relevance before selecting the final context. This uses the existing index; no rebuild is required. All turns retrieve fresh evidence. Query rewriting can resolve follow-up references using recent user messages. Retrieval initialization failure aborts the run; retrieval errors fail the case rather than silently becoming empty context. A successful search with no selected evidence is recorded as empty retrieval.

## 3. Optional automated judge

```powershell
$env:EVAL_API_KEY = 'your-evaluator-key'
$env:EVAL_MODEL = 'your-evaluator-model'
# Optional for another compatible provider:
# $env:EVAL_BASE_URL = 'https://your-provider.example/v1'
python -m scripts.evaluate --judge
```

Choose a model supporting JSON object output. The judge receives questions, answers, reference answers and retrieved legal passages; use synthetic or appropriately approved data. It scores faithfulness, reviewed-reference correctness, expected behavior and citation support. Scores are estimates requiring human spot-checks. Judge calls cost extra; a separate model/provider can reduce self-grading bias. Missing context or references produce null scores. Citation identifier validity is checked locally and only establishes that `[Source N]` is in range, not that the claim is supported. No citations yield an unscored identifier check.

## 4. Exercise the real API

Start the backend separately and use a dedicated test user's valid Supabase access token:

```powershell
$env:JUSTIFAI_EVAL_TOKEN = 'test-user-access-token'
python -m scripts.evaluate --mode api --api-url http://localhost:8000 --limit 2
```

API mode creates real chats/messages in the test account and retains them for inspection. Each case starts a new chat; optional `prior_user_turns` are replayed through the server before the final question. Pipeline mode instead uses optional explicit `history` role/content fixtures. Keep these equivalent when comparing modes. API mode includes authentication, persistence and routing, but the endpoint does not expose retrieved chunks: retrieval metrics, context faithfulness and citation support are unavailable. API correctness and behavior can still be judged. Pipeline and API mode share refusal-source cleanup. Pipeline captures the full context even for refusals.

## Reports and comparison

Each run creates an ignored timestamped folder under `evaluation/runs/` containing:

- `results.jsonl`: inputs, full evidence, outputs, errors and scores.
- `scores.csv`: per-case scores for analysis.
- `summary.json`: averages with scored-case counts and run settings.
- `report.md`: readable results and cases requiring review.

Never compare averages without their scored-case counts and failures. Failed cases remain visible; process exit status is nonzero on execution/judge errors. These are not quality pass/fail gates. Latency includes setup turns in API mode but excludes optional judging. Pipeline metadata records generator settings, index name, chunking, dataset hash and source-file hashes; archive the actual index snapshot/version, code revision and prompts with your experiment because an index name alone is not a version. API server configuration must be recorded separately. Timeouts on synchronous network operations may depend on provider timeouts.

Repeat a subset to measure variability at the existing generator temperature of 0.1. Expert-review low scores and a random sample of high scores. The default 0.8 flag in the report is a review aid, not a validated legal accuracy threshold.

Offline verification:

```powershell
python -m unittest discover -s tests -p 'test_evaluation.py'
```
