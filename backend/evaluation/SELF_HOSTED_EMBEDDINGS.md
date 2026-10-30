# Self-hosted embeddings — 30 October 2026

The hosted backend defaults to `EMBEDDING_PROVIDER=fastembed`. It runs
`nomic-ai/nomic-embed-text-v1.5-Q` on its own CPU through FastEmbed 0.9.1.
No laptop, Ollama server, Nomic API key, or per-query Nomic API payment is
required. DeepSeek and Pinecone remain separate services with their own plans.

`auto` is an alias for the same CPU provider. A leftover Nomic API key does not
cause either provider to call the paid API. The paid API is available only with
the explicit `nomic` provider. `local` retains the existing Ollama option.
Provider failures do not silently switch to a different provider.

The model downloads public weights on its first load and caches them under
`.cache/fastembed` (override with `FASTEMBED_CACHE_PATH`). Its cache is excluded
from Git. Cold startup can take longer when the host needs to download it again.
The backend loads and exercises its selected encoder before marking RAG ready.

One process shares one model. Inference uses one CPU thread, one text per batch,
disabled ONNX CPU memory arenas, and a lock to serialize concurrent inference.
Only search embeddings are truncated to 512 tokens to bound attention memory;
the full question still reaches answer generation. Quantization and truncation
can alter search results, so this is not an identical-vector replacement or a
claim that retrieval quality has been fully evaluated.

Local Windows measurement with the complete API imported: approximately 284 MB
resident memory after model load and 366 MB sampled peak including a long input
truncated to 512 tokens. These measurements are not a Linux/Render memory
guarantee and do not cover simultaneous OCR/document processing. Render's free
instance has limited RAM and CPU; monitor its deployed memory and latency.

Three synthetic smoke queries returned evidence from the existing versioned
Pinecone index. Initial vector cosine similarities to the existing Ollama
encoder were approximately 0.971–0.972. This is a compatibility smoke check,
not an independent accuracy evaluation. No index rebuild was performed.

## Deployment

Install `backend/requirements.txt` and deploy the updated backend. If Render has
an explicit `EMBEDDING_PROVIDER`, set it to `fastembed`. Existing `auto` also uses
the CPU model. The health endpoint `/api/health` reports `embedding_provider` and
`rag_ready`. Wait for `rag_ready: true`, then retry chat in the existing APK.
No APK rebuild or database migration is required for this backend change.

The `.python-version` files select the latest Python 3.11 patch for native runtime wheels.
An explicit Render `PYTHON_VERSION` setting can override the file; use a
compatible Python version if the install reports unavailable wheels.

Validation: 123 regression tests ran in both the original and fresh full-runtime
environments, with five optional tests skipped. The fresh dependency install
also exposed SlowAPI route discovery skipping rate limits on newer FastAPI;
the global budget now uses a stable scope without depending on router internals.
The original holiday/overtime question completed the full pipeline with three
sources in about 5.2 seconds locally, with paid Nomic and Ollama calls blocked.
