import json
from pathlib import Path
import tempfile
import unittest

from scripts.evaluate import load_cases, score, write_reports


class EvaluationTests(unittest.TestCase):
    def test_passage_metrics_require_url_and_passage(self):
        case = {"expected_evidence": [{"url": "a", "text_contains": "first passage"},
                                      {"url": "b", "text_contains": "second"}]}
        result = {"retrieved_chunks": [{"url": "a", "text": "FIRST\nPASSAGE"},
                                        {"url": "wrong", "text": "second"}],
                  "sources": [{}], "answer": "Claim [Source 1], claim [Source 2]."}
        metrics = score(case, result)
        self.assertEqual(metrics["recall_at_k"], .5)
        self.assertEqual(metrics["precision_at_k"], .5)
        self.assertEqual(metrics["hit_rate_at_k"], 1)
        self.assertEqual(metrics["citation_identifier_validity"], .5)

    def test_empty_vs_unavailable_retrieval(self):
        case = {"expected_evidence": [{"url": "a", "text_contains": "x"}]}
        self.assertEqual(score(case, {"retrieved_chunks": []})["recall_at_k"], 0)
        self.assertNotIn("recall_at_k", score(case, {"retrieved_chunks": None}))
        self.assertNotIn("recall_at_k", score({}, {"retrieved_chunks": []}))
        self.assertIsNone(score({}, {})["citation_identifier_validity"])

    def test_dataset_validation_and_duplicate_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cases.jsonl"
            case = {"id": "x", "question": "Question?", "expected_behavior": "answer"}
            path.write_text(json.dumps(case) + "\n", encoding="utf-8")
            self.assertEqual(len(load_cases(path)), 1)
            path.write_text((json.dumps(case) + "\n") * 2, encoding="utf-8")
            with self.assertRaises(ValueError):
                load_cases(path)

    def test_report_denominators_and_failed_cases(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "run"
            summary = write_reports(target, [
                {"id": "a", "status": "ok", "metrics": {"recall_at_k": .5}},
                {"id": "b", "status": "error", "error": "unavailable"}], {})
            self.assertEqual(summary["failed"], 1)
            self.assertEqual(summary["averages"]["recall_at_k"]["scored_cases"], 1)
            self.assertIn("unavailable", (target / "report.md").read_text())


if __name__ == "__main__":
    unittest.main()
