import csv
from pathlib import Path
import tempfile
import unittest

from scripts.ragas_eval import convert_samples, metric_requests, sample_documents


class RagasIntegrationTests(unittest.TestCase):
    def test_unreviewed_references_are_not_silently_trusted(self):
        row = {"question": "q", "answer": "a", "exact_context": "context", "reference_answer": "r", "reviewed": False}
        self.assertEqual([n for n, _ in metric_requests(row)], ["faithfulness"])
        self.assertEqual([n for n, _ in metric_requests(row, True)], ["faithfulness"])
        row["reference_origin"] = "ragas_synthetic"
        self.assertEqual([n for n, _ in metric_requests(row, True)],
                         ["faithfulness", "synthetic_factual_correctness", "synthetic_context_recall"])
        row["reviewed"] = True
        self.assertIn("factual_correctness", [n for n, _ in metric_requests(row)])

    def test_api_context_is_unavailable(self):
        row = {"question": "q", "answer": "a", "exact_context": None, "reference_answer": "r", "reviewed": True}
        self.assertEqual([n for n, _ in metric_requests(row)], ["factual_correctness"])

    def test_conversion_preserves_draft_provenance(self):
        row = convert_samples([{"user_input": "q", "reference": "r", "reference_contexts": ["c"]}])[0]
        self.assertFalse(row["reviewed"])
        self.assertEqual(row["reference_contexts"], ["c"])
        self.assertEqual(row["expected_evidence"], [])
        with self.assertRaises(ValueError):
            convert_samples([])

    def test_sampling_is_seeded_and_does_not_truncate_laws(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "laws.csv"
            with path.open("w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=["text", "url"])
                writer.writeheader()
                writer.writerows({"text": str(i) * 2500, "url": str(i)} for i in range(9))
            first = sample_documents(path, 3, 42)
            self.assertEqual(first, sample_documents(path, 3, 42))
            self.assertEqual(len(first), 3)
            self.assertTrue(all(len(r["text"]) == 2500 for r in first))


if __name__ == "__main__":
    unittest.main()
