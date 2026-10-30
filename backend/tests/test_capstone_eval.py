import json
from pathlib import Path
import tempfile
import unittest

from scripts.capstone_eval import group_summary, validate_judgment, verify


class CapstoneEvaluationTests(unittest.TestCase):
    def judgment(self):
        return dict(behavior_pass=True, language_pass=True, critical_error=False,
                    draft_reference_agreement=.8, faithfulness=.9, citation_support=.7,
                    reason="Preserves the required conditions.")

    def test_undefined_context_and_behavior_only_references_are_unscored(self):
        result = validate_judgment(self.judgment(), {"expected_behavior": "abstain", "exact_context": ""})
        self.assertIsNone(result["draft_reference_agreement"])
        self.assertIsNone(result["faithfulness"])
        self.assertIsNone(result["citation_support"])

    def test_rejects_nonfinite_and_boolean_numeric_scores(self):
        for bad in [float("nan"), float("inf"), True, -.1, 1.1]:
            judgment = {**self.judgment(), "faithfulness": bad}
            with self.assertRaises(ValueError):
                validate_judgment(judgment, {"expected_behavior": "answer", "exact_context": "evidence"})

    def test_failure_does_not_silently_enter_scored_denominator(self):
        groups = group_summary([
            {"language": "en", "status": "ok", "capstone_judge": self.judgment()},
            {"language": "en", "status": "judge_error"}], "language")
        self.assertEqual(groups["en"]["cases"], 2)
        self.assertEqual(groups["en"]["errors"], 1)
        self.assertEqual(groups["en"]["metrics"]["behavior_pass"]["scored_cases"], 1)

    def test_changed_frozen_dataset_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "manifest.json").write_text(json.dumps({"dataset_sha256": "wrong"}))
            (root / "test.jsonl").write_text("{}\n")
            with self.assertRaisesRegex(ValueError, "Frozen dataset changed"):
                verify(root)


if __name__ == "__main__":
    unittest.main()
