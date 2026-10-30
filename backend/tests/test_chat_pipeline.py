import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.services import chat_pipeline
from app.services.rag import RAGSearchError
from app.services.response_planning import QueryPlan
from scripts.evaluate import pipeline as evaluate_pipeline


class ChatPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_first_message_followup_phrase_still_retrieves(self):
        with patch.object(chat_pipeline.settings, "DEEPSEEK_API_KEY", "test"), patch.object(
                chat_pipeline, "plan_query", new=AsyncMock(return_value=QueryPlan(query="employment dismissal"))), patch.object(
                chat_pipeline.rag_service, "search", return_value=[]) as search, patch.object(
                chat_pipeline, "generate_response", new=AsyncMock(return_value="I need more evidence.")):
            result = await chat_pipeline.run_chat_pipeline("What should I do about dismissal?")
            search.assert_called_once_with("employment dismissal", top_k=5, law_types=None, strict=True,
                                           law_query="What should I do about dismissal?")
            self.assertFalse(result["retrieval_skipped"])
            self.assertTrue(result["empty_retrieval"])

    async def test_failure_does_not_generate_unsupported_fallback(self):
        with patch.object(chat_pipeline.settings, "DEEPSEEK_API_KEY", "test"), patch.object(
                chat_pipeline.rag_service, "search", side_effect=RAGSearchError("offline")), patch.object(
                chat_pipeline, "generate_response", new=AsyncMock()) as generate:
            with self.assertRaises(RAGSearchError):
                await chat_pipeline.run_chat_pipeline("Question", rewrite=False)
            generate.assert_not_called()

    async def test_valid_refusal_is_not_an_execution_failure(self):
        with patch.object(chat_pipeline.settings, "DEEPSEEK_API_KEY", "test"), patch.object(
                chat_pipeline.rag_service, "search", return_value=[]), patch.object(
                chat_pipeline, "generate_response", new=AsyncMock(return_value="⚠️ **Legal Queries Only**")):
            result = await chat_pipeline.run_chat_pipeline("Recipe please", rewrite=False)
            self.assertEqual(result["sources"], [])
            self.assertIn("Legal Queries Only", result["answer"])

    async def test_evaluator_calls_the_shared_app_pipeline(self):
        case = {"question": "Explain that", "history": [{"role": "user", "content": "privacy"}]}
        args = SimpleNamespace(top_k=5, no_rewrite=False)
        with patch.object(chat_pipeline, "run_chat_pipeline", new=AsyncMock(return_value={"answer": "ok"})) as run:
            self.assertEqual(await evaluate_pipeline(case, args), {"answer": "ok"})
            run.assert_awaited_once_with("Explain that", history=case["history"], law_types=None, top_k=5, rewrite=True)

    async def test_stream_chat_pipeline_shares_retrieval_and_citation_rules(self):
        async def fake_stream(*_args, **_kwargs):
            yield "Grounded answer "
            yield "[Source 1]"

        mock_source = {"short_title": "RA 10173", "full_title": "Data Privacy Act", "law_type": "ra",
                       "date": "2012", "url": "https://example.test/ra10173", "label": "Republic Acts"}
        with patch.object(chat_pipeline.settings, "DEEPSEEK_API_KEY", "test"), patch.object(
                chat_pipeline, "plan_query", new=AsyncMock(return_value=QueryPlan(query="RA 10173"))), patch.object(
                chat_pipeline.rag_service, "search", return_value=[]) as search, patch.object(
                chat_pipeline.rag_service, "get_sources", return_value=[mock_source]), patch.object(
                chat_pipeline, "stream_response", side_effect=fake_stream):
            events = [event async for event in chat_pipeline.stream_chat_pipeline("Explain RA 10173")]
            search.assert_called_once()
            result_events = [e for e in events if e["type"] == "result"]
            self.assertEqual(len(result_events), 1)
            self.assertEqual(result_events[0]["answer"], "Grounded answer [Source 1]")
            self.assertEqual(len(result_events[0]["sources"]), 1)


if __name__ == "__main__":
    unittest.main()
