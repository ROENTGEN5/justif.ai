import sys
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.services import cpu_embeddings as cpu, rag


class CPUEmbeddingTests(unittest.TestCase):
    def tearDown(self):
        rag.embed_query.cache_clear()

    def test_model_is_shared_and_concurrent_inference_is_serialized(self):
        active = 0
        peak = 0
        guard = threading.Lock()

        def embed(*args, **kwargs):
            nonlocal active, peak
            with guard:
                active += 1
                peak = max(peak, active)
            time.sleep(.01)
            with guard:
                active -= 1
            return iter([SimpleNamespace(tolist=lambda: [0.1] * 768)])

        model = Mock()
        model.embed.side_effect = embed
        factory = Mock(return_value=model)
        with patch.object(cpu, "_model", None), patch.dict(
            sys.modules, {"fastembed": SimpleNamespace(TextEmbedding=factory)}
        ):
            with ThreadPoolExecutor(max_workers=4) as pool:
                vectors = list(pool.map(lambda _: cpu.embed_texts(["question"]), range(4)))
        self.assertEqual(len(vectors), 4)
        self.assertEqual(peak, 1)
        factory.assert_called_once()
        self.assertEqual(factory.call_args.kwargs["threads"], 1)
        self.assertFalse(factory.call_args.kwargs["enable_cpu_mem_arena"])
        model.model.tokenizer.enable_truncation.assert_called_once_with(max_length=512)
        self.assertEqual(model.embed.call_args.args[0], ["search_query: question"])
        self.assertEqual(model.embed.call_args.kwargs["batch_size"], 1)

    def test_invalid_vectors_and_tasks_are_rejected(self):
        for vector in ([0.1], [float("nan")] * 768):
            model = Mock()
            model.embed.side_effect = lambda *a, **k: iter([SimpleNamespace(tolist=lambda: vector)])
            with patch.object(cpu, "_model", model):
                with self.assertRaises(RuntimeError):
                    cpu.embed_texts(["question"])
        with self.assertRaises(ValueError):
            cpu.embed_texts(["question"], "unexpected")

    def test_auto_and_fastembed_never_call_paid_api_even_with_a_key(self):
        for provider in ("auto", "fastembed"):
            with patch.object(rag.settings, "EMBEDDING_PROVIDER", provider), patch.object(
                rag.settings, "NOMIC_API_KEY", "configured-but-must-not-be-used"
            ), patch.object(cpu, "embed_texts", return_value=[[.1] * 768]) as embed, patch.object(
                rag, "_embed_via_nomic_api"
            ) as paid, patch.object(rag, "_ollama_client") as ollama:
                rag.embed_query.cache_clear()
                self.assertEqual(len(rag.embed_query("question")), 768)
                rag.embed_documents(["document"])
                paid.assert_not_called()
                ollama.embed.assert_not_called()
                self.assertEqual(embed.call_args.args, (["document"], "search_document"))

    def test_missing_model_does_not_advertise_rag_readiness(self):
        client = Mock()
        client.Index.return_value.describe_index_stats.return_value.total_vector_count = 100
        with patch.object(rag.settings, "PINECONE_API_KEY", "test"), patch.object(
            rag.settings, "EMBEDDING_PROVIDER", "fastembed"
        ), patch.object(rag, "Pinecone", return_value=client), patch.object(
            cpu, "initialize", side_effect=RuntimeError("model unavailable")
        ), self.assertLogs("app.services.rag", level="ERROR"):
            service = rag.RAGService()
            service.initialize()
        self.assertFalse(service.is_ready)
