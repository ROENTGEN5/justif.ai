import unittest

from app.services.relevance import lexical_scores


class RelevanceTests(unittest.TestCase):
    def test_requested_rights_outrank_generic_processing_text(self):
        scores = lexical_scores("rights over personal information", [
            "The processing of personal information must be lawful.",
            "Rights of the data subject include access and correction of personal information."])
        self.assertGreater(scores[1], scores[0])

    def test_explicit_article_numbers_distinguish_passages(self):
        scores = lexical_scores("Article 1670 lease", ["Article 1670 concerns lease terms.", "Article 1673 concerns lease terms."])
        self.assertGreater(scores[0], scores[1])

    def test_missing_lexical_matches_keep_semantic_scores_unchanged(self):
        self.assertEqual(lexical_scores("pahintulot", ["Personal data processing.", "Lease renewal."]), [0, 0])
        self.assertEqual(lexical_scores("question", []), [])
