"""The same retrieval and generation path for live chat and evaluation."""
import asyncio
import time
import re

from app.config import settings
from app.services.deepseek import generate_response, plan_query, stream_response
from app.services.rag import rag_service
from app.services.response_planning import QueryPlan, bounded_history, retrieval_identity
from app.services.usage import completion_usage


async def run_chat_pipeline(message, history=None, law_types=None, top_k=5, rewrite=True):
    history = bounded_history(history or [])
    if not settings.DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY is required")

    records = []
    token = completion_usage.set(records)
    started = time.perf_counter()
    try:
        return await _run(message, history, law_types, top_k, rewrite, records, started)
    finally:
        completion_usage.reset(token)


async def _run(message, history, law_types, top_k, rewrite, records, started):
    plan_started = time.perf_counter()
    plan = await plan_query(message, messages=history) if rewrite else QueryPlan(query=message)
    plan_seconds = time.perf_counter() - plan_started
    if plan.intent != "retrieve":
        return {"answer": plan.direct_answer, "sources": [], "retrieved_chunks": [],
                "exact_context": "", "rewritten_search_query": "", "retrieval_skipped": True,
                "empty_retrieval": False, "response_intent": plan.intent,
                "usage": records, "timings": {"plan_seconds": plan_seconds,
                    "retrieval_seconds": 0, "generation_seconds": 0, "total_seconds": time.perf_counter() - started}}
    query = plan.query
    law_query = retrieval_identity(message, history, plan.uses_history)
    retrieval_started = time.perf_counter()
    results = await asyncio.to_thread(
        rag_service.search, query, top_k=top_k, law_types=law_types, strict=True, law_query=law_query)
    retrieval_seconds = time.perf_counter() - retrieval_started
    sources = rag_service.get_sources(results)
    context = rag_service.format_context_from_sources(results, sources) if results else ""
    generation_started = time.perf_counter()
    answer = await generate_response(history, message, context, not history)
    if not answer or not answer.strip():
        raise RuntimeError("Generator returned an empty answer")
    # Domain refusal is a valid response, not a failed evaluation. Preserve the
    # route's source cleanup without mistaking every warning emoji for an error.
    if not re.search(r"\[Source\s+\d+\]", answer, re.I):
        sources = []
    return {
        "answer": answer,
        "rewritten_search_query": query,
        "retrieved_chunks": [
            {**r.chunk.to_dict(), "chunk_index": r.chunk.chunk_index,
             "text": r.chunk.text, "score": float(r.score),
             "evidence_span": getattr(r, "evidence_span", None)} for r in results
        ],
        "sources": sources,
        "exact_context": context,
        "retrieval_skipped": False,
        "empty_retrieval": not bool(results),
        "response_intent": plan.intent,
        "retrieval_identity": law_query,
        "usage": records,
        "timings": {"plan_seconds": plan_seconds, "retrieval_seconds": retrieval_seconds,
                    "generation_seconds": time.perf_counter() - generation_started,
                    "total_seconds": time.perf_counter() - started},
    }


async def stream_chat_pipeline(message, history=None, law_types=None, top_k=5, rewrite=True):
    """Stream the shared retrieval and generation pipeline, yielding stage/token/result events."""
    history = bounded_history(history or [])
    if not settings.DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY is required")

    records = []
    token = completion_usage.set(records)
    started = time.perf_counter()
    try:
        yield {"type": "thinking", "stage": "Searching Philippine Laws & R.A. database..."}
        plan_started = time.perf_counter()
        plan = await plan_query(message, messages=history) if rewrite else QueryPlan(query=message)
        plan_seconds = time.perf_counter() - plan_started

        if plan.intent != "retrieve":
            direct_answer = plan.direct_answer or ""
            if direct_answer:
                yield {"type": "token", "text": direct_answer}
            yield {
                "type": "result",
                "answer": direct_answer,
                "sources": [],
                "retrieved_chunks": [],
                "exact_context": "",
                "rewritten_search_query": "",
                "retrieval_skipped": True,
                "empty_retrieval": False,
                "response_intent": plan.intent,
                "usage": records,
                "timings": {
                    "plan_seconds": plan_seconds,
                    "retrieval_seconds": 0,
                    "generation_seconds": 0,
                    "total_seconds": time.perf_counter() - started,
                },
            }
            return

        yield {"type": "thinking", "stage": "Analyzing relevant Supreme Court decisions..."}
        query = plan.query
        law_query = retrieval_identity(message, history, plan.uses_history)
        retrieval_started = time.perf_counter()
        results = await asyncio.to_thread(
            rag_service.search,
            query,
            top_k=top_k,
            law_types=law_types,
            strict=True,
            law_query=law_query,
        )
        retrieval_seconds = time.perf_counter() - retrieval_started
        sources = rag_service.get_sources(results)
        context = rag_service.format_context_from_sources(results, sources) if results else ""

        yield {"type": "thinking", "stage": "Drafting legal analysis..."}
        generation_started = time.perf_counter()
        chunks: list[str] = []
        async for token_chunk in stream_response(history, message, context, not history):
            chunks.append(token_chunk)
            yield {"type": "token", "text": token_chunk}

        answer = "".join(chunks)
        if not answer or not answer.strip():
            raise RuntimeError("Generator returned an empty answer")
        if not re.search(r"\[Source\s+\d+\]", answer, re.I):
            sources = []

        yield {
            "type": "result",
            "answer": answer,
            "rewritten_search_query": query,
            "retrieved_chunks": [
                {
                    **r.chunk.to_dict(),
                    "chunk_index": r.chunk.chunk_index,
                    "text": r.chunk.text,
                    "score": float(r.score),
                    "evidence_span": getattr(r, "evidence_span", None),
                }
                for r in results
            ],
            "sources": sources,
            "exact_context": context,
            "retrieval_skipped": False,
            "empty_retrieval": not bool(results),
            "response_intent": plan.intent,
            "retrieval_identity": law_query,
            "usage": records,
            "timings": {
                "plan_seconds": plan_seconds,
                "retrieval_seconds": retrieval_seconds,
                "generation_seconds": time.perf_counter() - generation_started,
                "total_seconds": time.perf_counter() - started,
            },
        }
    finally:
        completion_usage.reset(token)
