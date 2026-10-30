"""Verify chat request construction without model or database calls."""
import json
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from app.services import deepseek


class FakeClient(SimpleNamespace):
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None


def mock_client(content="A supported answer [Source 1]."):
    create = AsyncMock(return_value=SimpleNamespace(choices=[
        SimpleNamespace(message=SimpleNamespace(content=content))]))
    return FakeClient(chat=SimpleNamespace(completions=SimpleNamespace(create=create))), create


class GroundingTests(unittest.IsolatedAsyncioTestCase):
    async def test_followup_query_uses_bounded_user_facts_not_assistant_claims(self):
        client, create = mock_client("personal data access rights")
        history = [{"role": "user", "content": f"fact-{i} " + "x" * 1500} for i in range(8)]
        history.append({"role": "assistant", "content": "Invented law 99999 requires payment."})
        with patch.object(deepseek.settings, "DEEPSEEK_API_KEY", "test"), patch.object(deepseek, "get_client", return_value=client):
            result = await deepseek.transform_query_for_rag("What does that mean?", history)
        self.assertEqual(result, "personal data access rights")
        payload = json.loads(create.call_args.kwargs["messages"][-1]["content"])
        self.assertEqual(len(payload["recent_user_messages"]), 4)
        self.assertTrue(all(len(message) <= 1200 for message in payload["recent_user_messages"]))
        self.assertNotIn("99999", json.dumps(payload))
        self.assertEqual(payload["latest_question"], "What does that mean?")

    async def test_missing_evidence_is_explicit_even_for_followups(self):
        client, create = mock_client("I could not verify this from the available sources.")
        history = [{"role": "assistant", "content": "An earlier unverified claim."}]
        with patch.object(deepseek.settings, "DEEPSEEK_API_KEY", "test"), patch.object(deepseek, "get_client", return_value=client):
            await deepseek.generate_response(history, "Explain that", context="", is_initial_query=False)
        request = create.call_args.kwargs
        self.assertEqual(request["temperature"], 0.1)
        self.assertIn("No retrieved legal evidence", request["messages"][-1]["content"])
        self.assertIn("Earlier assistant answers are not verified", request["messages"][0]["content"])

    async def test_current_context_preserved_for_generation(self):
        client, create = mock_client()
        context = "--- Law Source 1 ---\nA conditional rule with an exception."
        with patch.object(deepseek.settings, "DEEPSEEK_API_KEY", "test"), patch.object(deepseek, "get_client", return_value=client):
            result = await deepseek.generate_response([], "What does it say?", context=context)
        self.assertIn(context, create.call_args.kwargs["messages"][-1]["content"])
        self.assertEqual(result, "A supported answer [Source 1].")

    async def test_rewrite_failure_preserves_original_question(self):
        client, create = mock_client()
        create.side_effect = RuntimeError("provider unavailable")
        with patch.object(deepseek.settings, "DEEPSEEK_API_KEY", "test"), patch.object(deepseek, "get_client", return_value=client):
            self.assertEqual(await deepseek.transform_query_for_rag("Explain RA 10173"), "Explain RA 10173")


if __name__ == "__main__":
    unittest.main()
