"""Bounded CPU embeddings using the quantized, open Nomic v1.5 weights."""
import math
import os
from threading import RLock

MODEL = "nomic-ai/nomic-embed-text-v1.5-Q"
DIMENSIONS = 768
MAX_TOKENS = 512
_model = None
_lock = RLock()


def _get_model():
    global _model
    with _lock:
        if _model is None:
            from fastembed import TextEmbedding

            model = TextEmbedding(
                model_name=MODEL,
                cache_dir=os.getenv("FASTEMBED_CACHE_PATH", ".cache/fastembed"),
                threads=1,
                providers=["CPUExecutionProvider"],
                enable_cpu_mem_arena=False,
            )
            # Limit attention memory on small hosts. Full questions are still
            # supplied to answer generation; this bound applies only to search.
            model.model.tokenizer.enable_truncation(max_length=MAX_TOKENS)
            _model = model
        return _model


def embed_texts(texts: list[str], task_type: str = "search_query") -> list[list[float]]:
    if task_type not in {"search_query", "search_document"}:
        raise ValueError("Unsupported embedding task")
    if not texts:
        return []
    # One shared model, one inference at a time, one text per batch. Concurrent
    # chat requests must not allocate multiple attention workspaces.
    with _lock:
        model = _get_model()
        vectors = []
        for text in texts:
            vector = next(model.embed([f"{task_type}: {text}"], batch_size=1)).tolist()
            if len(vector) != DIMENSIONS or not all(math.isfinite(v) for v in vector):
                raise RuntimeError("CPU embedding model returned an invalid vector")
            vectors.append(vector)
        return vectors


def initialize():
    """Load and exercise the encoder before advertising retrieval readiness."""
    embed_texts(["Legal information search"])
