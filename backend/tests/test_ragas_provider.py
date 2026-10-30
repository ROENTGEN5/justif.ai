"""Exercise the actual Ragas/Instructor request path without paid API calls."""
import json
import importlib.util
import asyncio
import unittest
from unittest.mock import patch, AsyncMock
import tempfile
from pathlib import Path
from types import SimpleNamespace

import httpx
from openai import AsyncOpenAI

from scripts.ragas_eval import score_saved


@unittest.skipUnless(importlib.util.find_spec("ragas"), "Run in .venv-ragas for optional generation dependencies")
class GenerationSetupTests(unittest.TestCase):
    def test_generation_stages_share_a_loop_and_preparation_is_resumable(self):
        from ragas.async_utils import run
        from scripts.ragas_eval import generate_session
        loops = []

        async def stage():
            loops.append(id(asyncio.get_running_loop()))

        def prepare(*args, **kwargs):
            run(stage())
            run(stage())

        def synthesize(*args, **kwargs):
            run(stage())
            run(stage())
            return "generated-dataset"

        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "prepared.json"
            docs = [{"text": "Example provision.", "url": "https://example.invalid/law"}]
            with patch("ragas.testset.transforms.apply_transforms", side_effect=prepare) as preparation, patch(
                    "ragas.testset.TestsetGenerator.generate", side_effect=synthesize), patch(
                    "httpx.AsyncClient.send", side_effect=AssertionError("Unexpected external request")):
                with asyncio.Runner() as runner:
                    result = runner.run(generate_session(docs, 2, "offline-test", "offline-test",
                                                         "https://example.invalid", checkpoint))
                self.assertEqual(result, "generated-dataset")
                self.assertEqual(len(loops), 4)
                self.assertEqual(len(set(loops)), 1)
                self.assertTrue(checkpoint.exists())
                with asyncio.Runner() as runner:
                    runner.run(generate_session(docs, 2, "offline-test", "offline-test",
                                                "https://example.invalid", checkpoint))
                self.assertEqual(preparation.call_count, 1)

    def test_mixed_short_and_long_documents_receive_required_properties(self):
        from ragas.testset.graph import KnowledgeGraph, Node, NodeType
        from ragas.testset.transforms import apply_transforms
        from ragas.testset.transforms.extractors.llm_based import SummaryExtractor, NERExtractor, ThemesExtractor
        from ragas.testset.transforms.extractors.embeddings import EmbeddingExtractor
        from ragas.run_config import RunConfig
        from scripts.ragas_eval import generation_transforms, generation_embeddings
        from langchain_openai import ChatOpenAI
        from ragas.llms import LangchainLLMWrapper

        nodes = [Node(type=NodeType.DOCUMENT, properties={"page_content": text}) for text in
                 ("A short statutory provision. " * 10, "A longer statutory provision with qualifications. " * 500)]
        graph = KnowledgeGraph(nodes=nodes)
        llm = LangchainLLMWrapper(ChatOpenAI(model="offline-test", api_key="offline-test"))
        with patch.object(SummaryExtractor, "extract", new=AsyncMock(return_value=("summary", "A summary."))), patch.object(
                NERExtractor, "extract", new=AsyncMock(return_value=("entities", ["Example Act"]))), patch.object(
                ThemesExtractor, "extract", new=AsyncMock(return_value=("themes", ["Rights"]))), patch.object(
                EmbeddingExtractor, "extract", new=AsyncMock(return_value=("summary_embedding", [1., 0.]))):
            apply_transforms(graph, generation_transforms(llm, generation_embeddings()),
                             run_config=RunConfig(max_workers=2))
        self.assertEqual(len(graph.nodes), 2)
        for node in nodes:
            self.assertEqual(node.get_property("entities"), ["Example Act"])
            self.assertEqual(node.get_property("summary"), "A summary.")
            self.assertEqual(node.get_property("summary_embedding"), [1., 0.])

    def test_default_generation_transforms_construct_without_api_calls(self):
        from langchain_core.documents import Document
        from langchain_openai import ChatOpenAI
        from ragas.llms import LangchainLLMWrapper
        from ragas.testset.transforms import default_transforms
        from scripts.ragas_eval import generation_embeddings

        # This is the setup path that originally failed before generation began.
        documents = [Document(page_content="The rights and duties are described in this provision. " * 150)]
        with patch("httpx.Client.send", side_effect=AssertionError("Unexpected external request")):
            llm = LangchainLLMWrapper(ChatOpenAI(model="offline-test", api_key="offline-test"))
            transforms = default_transforms(documents=documents, llm=llm,
                                             embedding_model=generation_embeddings())
        self.assertTrue(transforms)


@unittest.skipUnless(importlib.util.find_spec("ragas"), "Run in .venv-ragas for the optional evaluator integration")
class ProviderRegressionTests(unittest.IsolatedAsyncioTestCase):
    async def test_faithfulness_through_real_instructor_with_mock_http(self):
        calls = []

        def handler(request):
            payload = json.loads(request.content)
            calls.append(payload)
            if len(calls) == 1:
                content = {"statements": ["Paris is in France."]}
            else:
                content = {"statements": [{"statement": "Paris is in France.",
                                           "reason": "The context states this.", "verdict": 1}]}
            return httpx.Response(200, json={
                "id": "mock", "object": "chat.completion", "created": 0,
                "model": "test-model", "choices": [{"index": 0, "finish_reason": "stop",
                    "message": {"role": "assistant", "content": json.dumps(content)}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}})

        class OfflineClient(AsyncOpenAI):
            def __init__(self, **kwargs):
                kwargs["http_client"] = httpx.AsyncClient(transport=httpx.MockTransport(handler))
                super().__init__(**kwargs)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "results.jsonl"
            path.write_text(json.dumps({"id": "test", "question": "Where is Paris?",
                "answer": "Paris is in France.", "exact_context": "Paris is in France.",
                "status": "ok", "reviewed": False}) + "\n", encoding="utf-8")
            args = SimpleNamespace(results=str(path), output=str(Path(directory) / "reports"),
                                   limit=None, preview=False, allow_synthetic=False, timeout=10, max_tokens=8192)
            with patch("openai.AsyncOpenAI", OfflineClient), patch(
                    "scripts.ragas_eval.llm_config", return_value=("offline-test", "test-model", "https://example.invalid/v1")):
                code = await score_saved(args)
            self.assertEqual(code, 0)
            result = json.loads(next((Path(directory) / "reports").glob("*/results.jsonl")).read_text())
            self.assertEqual(result["ragas_scores"]["faithfulness"], 1.0)
            self.assertEqual(len(calls), 2)
            self.assertTrue(all(c["response_format"]["type"] == "json_object" for c in calls))
            self.assertTrue(all(c["max_tokens"] == 8192 for c in calls))


if __name__ == "__main__":
    unittest.main()
