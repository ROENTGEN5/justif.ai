"""Generate draft datasets or score saved runs using Ragas (no app dependencies)."""
import argparse
import asyncio
import csv
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import random

from scripts.evaluate import write_reports


def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]


def sample_documents(path, count, seed):
    """Reservoir sample full, moderately sized laws rather than the first N rows."""
    csv.field_size_limit(2**30)
    rng, sample, eligible = random.Random(seed), [], 0
    with Path(path).open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            text = row.get("text", "").strip()
            if not 2000 <= len(text) <= 30000 or not row.get("url"):
                continue
            eligible += 1
            if len(sample) < count:
                sample.append(row)
            else:
                index = rng.randrange(eligible)
                if index < count:
                    sample[index] = row
    if not sample:
        raise ValueError("No suitable documents: need text (2,000–30,000 characters) and url columns")
    return sample


def llm_config():
    key = os.getenv("EVAL_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    explicit = bool(os.getenv("EVAL_API_KEY"))
    model = os.getenv("EVAL_MODEL") if explicit else os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    base = os.getenv("EVAL_BASE_URL", "https://api.openai.com/v1") if explicit else os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    if not key or not model:
        raise ValueError("Configure EVAL_API_KEY + EVAL_MODEL, or your existing DEEPSEEK_API_KEY")
    return key, model, base


def generation_embeddings():
    """Reuse Nomic/Ollama; no additional embedding provider key required."""
    import httpx
    from langchain_core.embeddings import Embeddings
    from ragas.embeddings import LangchainEmbeddingsWrapper

    class NomicEmbeddings(Embeddings):
        def embed_documents(self, texts):
            key = os.getenv("NOMIC_API_KEY")
            with httpx.Client(timeout=120) as client:
                if key:
                    response = client.post("https://api-atlas.nomic.ai/v1/embedding/text",
                                           headers={"Authorization": f"Bearer {key}"},
                                           json={"model": "nomic-embed-text-v1.5", "texts": texts,
                                                 "task_type": "search_document", "dimensionality": 768})
                else:
                    response = client.post(os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/") + "/api/embed",
                                           json={"model": "nomic-embed-text", "input": ["search_document: " + t for t in texts]})
                response.raise_for_status()
                return response.json()["embeddings"]

        def embed_query(self, text):
            return self.embed_documents([text])[0]

    return LangchainEmbeddingsWrapper(NomicEmbeddings())


def convert_samples(samples):
    rows = []
    for i, sample in enumerate(samples, 1):
        if not sample.get("user_input") or not sample.get("reference"):
            raise ValueError("Generated sample is missing question or reference")
        rows.append({"id": f"ragas-{i:03d}", "question": sample["user_input"],
                     "category": "synthetic", "language": "unspecified", "expected_behavior": "answer",
                     "reviewed": False, "reference_origin": "ragas_synthetic",
                     "reference_answer": sample["reference"],
                     "reference_contexts": sample.get("reference_contexts", []), "expected_evidence": []})
    if not rows:
        raise ValueError("Ragas generated no samples")
    return rows


def generation_transforms(llm, embeddings):
    """Prepare complete documents for the single-hop synthesizer.

    Ragas' default headline extractor skips short documents, but its splitter
    still visits them and raises when headlines are absent. Single-hop tests
    do not need that splitting/relationship pipeline. Use consistent document
    summaries, entities and themes for every sampled law instead.
    """
    from ragas.testset.graph import NodeType
    from ragas.testset.transforms import Parallel
    from ragas.testset.transforms.extractors.llm_based import SummaryExtractor, ThemesExtractor, NERExtractor
    from ragas.testset.transforms.extractors.embeddings import EmbeddingExtractor

    def documents_only(node):
        return node.type == NodeType.DOCUMENT

    return [
        SummaryExtractor(llm=llm, filter_nodes=documents_only),
        Parallel(
            ThemesExtractor(llm=llm, filter_nodes=documents_only),
            NERExtractor(llm=llm, filter_nodes=documents_only),
            EmbeddingExtractor(embedding_model=embeddings, property_name="summary_embedding",
                               embed_property_name="summary", filter_nodes=documents_only),
        ),
    ]


async def generate_session(docs, size, key, model, base, checkpoint):
    """Keep every Ragas stage and its HTTP connections on one event loop."""
    import httpx
    from langchain_openai import ChatOpenAI
    from ragas.llms import LangchainLLMWrapper
    from ragas.testset import TestsetGenerator
    from ragas.testset.graph import KnowledgeGraph, Node, NodeType
    from ragas.testset.transforms import apply_transforms
    from ragas.testset.synthesizers import SingleHopSpecificQuerySynthesizer
    from ragas.run_config import RunConfig
    config = RunConfig(timeout=180, max_retries=2, max_workers=2)
    # Ragas' synchronous entry points detect this running loop and use their
    # supported nest_asyncio path, rather than closing a new loop per stage.
    async with httpx.AsyncClient(timeout=120) as http_client:
        llm = LangchainLLMWrapper(ChatOpenAI(model=model, api_key=key, base_url=base,
            temperature=0, timeout=120, max_tokens=8192, http_async_client=http_client))
        embeddings = generation_embeddings()
        if checkpoint.exists():
            graph = KnowledgeGraph.load(checkpoint)
            print(f"Reusing prepared documents: {checkpoint}")
        else:
            graph = KnowledgeGraph(nodes=[Node(type=NodeType.DOCUMENT, properties={
                "page_content": d["text"], "document_metadata": {"source": d["url"], "label": d.get("label", "")}
            }) for d in docs])
            apply_transforms(graph, generation_transforms(llm, embeddings), run_config=config)
            checkpoint.parent.mkdir(parents=True, exist_ok=True)
            pending = checkpoint.with_suffix(".partial")
            graph.save(pending)
            pending.replace(checkpoint)
            print(f"Prepared documents saved: {checkpoint}")
        generator = TestsetGenerator(llm=llm, embedding_model=embeddings, knowledge_graph=graph)
        return generator.generate(testset_size=size,
            query_distribution=[(SingleHopSpecificQuerySynthesizer(llm=llm), 1.0)],
            run_config=config, raise_exceptions=True)


def generate(args):
    docs = sample_documents(args.csv, args.documents, args.seed)
    print(f"Selected {len(docs)} documents ({sum(len(d['text']) for d in docs):,} characters).")
    if args.preview:
        for doc in docs:
            print(doc["url"])
        print("Preview only. No API calls.")
        return 0
    output = Path(args.output)
    manifest = output.with_suffix(".sources.json")
    if output.exists() or manifest.exists():
        raise ValueError("Output already exists; choose a different --output")
    key, model, base = llm_config()
    source_manifest = {"model": model, "seed": args.seed, "preprocessing": "complete-document-single-hop-v1",
        "csv": str(Path(args.csv).resolve()),
        "documents": [{"url": d["url"], "sha256": hashlib.sha256(d["text"].encode()).hexdigest()} for d in docs]}
    cache_signature = hashlib.sha256(json.dumps({**source_manifest, "base_url": base}, sort_keys=True).encode()).hexdigest()
    checkpoint = Path("evaluation/runs/generation-cache") / (cache_signature + ".json")
    with asyncio.Runner() as runner:
        dataset = runner.run(generate_session(docs, args.size, key, model, base, checkpoint))
    samples = dataset.to_list()
    # Ragas rounds scenario allocations and can return one extra sample.
    rows = convert_samples(samples[:args.size])
    source_manifest.update(generated_samples=len(samples), saved_samples=len(rows))
    if len(rows) < args.size:
        print(f"Warning: Ragas returned only {len(rows)} of the requested {args.size} cases.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as f:
        f.write("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))
    manifest.write_text(json.dumps(source_manifest, indent=2), encoding="utf-8")
    print(f"Saved {len(rows)} draft cases: {output.resolve()}. These are not human-reviewed.")
    return 0


def metric_requests(row, allow_synthetic=False):
    """Plan metrics independently of provider setup; preserve reference provenance."""
    tasks = []
    context = row.get("exact_context")
    reference = row.get("reference_answer")
    eligible = row.get("reviewed") or (allow_synthetic and row.get("reference_origin") == "ragas_synthetic")
    # Score the formatted context actually sent, not chunks omitted by formatting.
    if context:
        tasks.append(("faithfulness", {"user_input": row["question"], "response": row["answer"], "retrieved_contexts": [context]}))
    if reference and eligible:
        prefix = "" if row.get("reviewed") else "synthetic_"
        tasks.append((prefix + "factual_correctness", {"response": row["answer"], "reference": reference}))
        if context:
            tasks.append((prefix + "context_recall", {"user_input": row["question"], "retrieved_contexts": [context], "reference": reference}))
    return tasks


async def score_saved(args):
    rows = read_jsonl(args.results)
    if not rows:
        raise ValueError("Results file is empty")
    if args.limit:
        rows = rows[:args.limit]
    if args.preview:
        for row in rows:
            names = [name for name, _ in metric_requests(row, args.allow_synthetic)] if row.get("status") == "ok" else []
            print(f"{row['id']}: {', '.join(names) or 'no eligible metrics'}")
        print("Preview only. No API calls.")
        return 0
    from openai import AsyncOpenAI
    from ragas.llms import llm_factory
    from ragas.metrics.collections import Faithfulness, FactualCorrectness, ContextRecall
    key, model, base = llm_config()
    async with AsyncOpenAI(api_key=key, base_url=base, timeout=120, max_retries=2) as client:
        # Ragas configures Instructor's JSON mode internally. Passing mode here
        # forwards it as a model argument and duplicates Instructor's own mode.
        llm = llm_factory(model, client=client, max_tokens=args.max_tokens)
        scorers = {"faithfulness": Faithfulness(llm=llm), "factual_correctness": FactualCorrectness(llm=llm),
                   "context_recall": ContextRecall(llm=llm)}
        for row in rows:
            row["ragas_scores"], row["ragas_errors"] = {}, {}
            if row.get("status") != "ok":
                continue
            tasks = metric_requests(row, args.allow_synthetic)
            row["ragas_skipped"] = not bool(tasks)
            for name, kwargs in tasks:
                try:
                    result = await asyncio.wait_for(scorers[name.removeprefix("synthetic_")].ascore(**kwargs), args.timeout)
                    value = float(result.value)
                    if not math.isfinite(value) or not 0 <= value <= 1:
                        raise ValueError("Metric returned an undefined or invalid score")
                    row["ragas_scores"][name] = value
                except Exception as exc:
                    row["ragas_errors"][name] = f"{type(exc).__name__}: {exc}"
            row.setdefault("metrics", {}).update({"ragas_" + k: v for k, v in row["ragas_scores"].items()})
            if row["ragas_errors"]:
                row.update(status="ragas_error", error=json.dumps(row["ragas_errors"]))
            print(f"{row['id']}: {row['ragas_scores']}")
            for name, error in row["ragas_errors"].items():
                if "max_tokens" in error or "finish_reason='length'" in error:
                    print(f"  {name}: evaluator response was cut off; try --max-tokens {args.max_tokens * 2}")
                else:
                    print(f"  {name}: {' '.join(error.split())[:240]} (details saved in results.jsonl)")
    target = Path(args.output) / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    summary = write_reports(target, rows, {"scorer": "ragas", "version": "0.4.3", "model": model,
        "source_results": str(Path(args.results).resolve()), "allow_synthetic": args.allow_synthetic,
        "max_tokens": args.max_tokens})
    print(f"Reports: {target.resolve()}")
    return int(summary["failed"] > 0 or not any(r.get("ragas_scores") for r in rows))


def main():
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="command", required=True)
    gen = subs.add_parser("generate", help="Create draft questions and answers from your laws CSV")
    gen.add_argument("--csv", default="data/final_clean_laws.csv")
    gen.add_argument("--documents", type=int, default=5)
    gen.add_argument("--size", type=int, default=10)
    gen.add_argument("--seed", type=int, default=42)
    gen.add_argument("--output", default="evaluation/generated.jsonl")
    gen.add_argument("--preview", action="store_true")
    scorer = subs.add_parser("score", help="Score saved results without calling your app again")
    scorer.add_argument("--results", required=True)
    scorer.add_argument("--output", default="evaluation/runs/ragas")
    scorer.add_argument("--allow-synthetic", action="store_true")
    scorer.add_argument("--limit", type=int)
    scorer.add_argument("--timeout", type=float, default=180)
    scorer.add_argument("--max-tokens", type=int, default=8192, help="Evaluator output budget (Ragas defaults to only 1024)")
    scorer.add_argument("--preview", action="store_true")
    args = parser.parse_args()
    for name in ("documents", "size", "limit", "timeout", "max_tokens"):
        value = getattr(args, name, None)
        if value is not None and value <= 0:
            parser.error(f"--{name} must be positive")
    raise SystemExit(generate(args) if args.command == "generate" else asyncio.run(score_saved(args)))


if __name__ == "__main__":
    main()
