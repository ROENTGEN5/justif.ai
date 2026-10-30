from types import SimpleNamespace
import unittest
from unittest.mock import Mock
import hashlib

from app.services.section_evidence import join_overlap, section_excerpt
from app.services.rag import RAGService
from test_retrieval import result


class SectionEvidenceTests(unittest.TestCase):
    def test_scraped_heading_glued_to_previous_text_is_recovered(self):
        text = "Electronic DocumentsSEC. 6. A complete rule.SEC. 7. Another rule."
        excerpt, complete = section_excerpt(text, ("section", "6"))
        self.assertEqual(excerpt, "SEC. 6. A complete rule.")
        self.assertTrue(complete)
        self.assertIsNone(section_excerpt("SUBSEC. 6. A subsection", ("section", "6")))

    def test_section_number_does_not_match_a_different_number_or_cross_reference(self):
        self.assertIsNone(section_excerpt("SEC. 18. A rule under Section 8 of another law.", ("section", "8")))

    def test_exact_overlap_preserves_complete_conditions(self):
        common = "a method that reliably identifies the party"
        body = join_overlap("SEC. 8. " + common, common + " AND permits verification. SEC. 9. Another rule.")
        excerpt, complete = section_excerpt(body, ("section", "8"))
        self.assertEqual(excerpt.count(common), 1)
        self.assertIn("AND permits verification", excerpt)
        self.assertNotIn("Another rule", excerpt)
        self.assertTrue(complete)

    def test_unrecovered_continuation_is_marked_not_assumed_complete(self):
        excerpt, complete = section_excerpt("SEC. 8. A partial condition", ("section", "8"))
        self.assertFalse(complete)
        self.assertIn("not recovered", excerpt)

    def test_matching_neighbor_recovers_section(self):
        service = RAGService()
        service.index = Mock()
        first = result("SEC. 8. First condition.", title="Act", index=2)
        first.chunk.total_chunks = 4
        vector_id = hashlib.md5(b"Act|Acts|3").hexdigest()
        meta = {"url": first.chunk.url, "short_title": "Act", "label": "Acts", "chunk_index": 3,
                "text": "Second required condition. SEC. 9. Next provision."}
        service.index.fetch.return_value = SimpleNamespace(vectors={vector_id: SimpleNamespace(metadata=meta)})
        windows = service._requested_sections([first], [("section", "8")], 5)
        self.assertEqual(len(windows), 1)
        self.assertIn("Second required condition", windows[0].chunk.text)
        self.assertTrue(windows[0].evidence_span["complete"])

    def test_legacy_id_collision_cannot_mix_documents(self):
        service = RAGService()
        service.index = Mock()
        first = result("SEC. 8. First condition.", title="Act", index=2)
        first.chunk.total_chunks = 4
        vector_id = hashlib.md5(b"Act|Acts|3").hexdigest()
        service.index.fetch.return_value = SimpleNamespace(vectors={vector_id: SimpleNamespace(metadata={
            "url": "https://other.test/act", "short_title": "Act", "label": "Acts", "chunk_index": 3,
            "text": "A dangerous contradictory rule. SEC. 9. Next."})})
        windows = service._requested_sections([first], [("section", "8")], 5)
        self.assertNotIn("contradictory", windows[0].chunk.text)
        self.assertFalse(windows[0].evidence_span["complete"])

    def test_gap_between_chunks_is_not_hidden(self):
        service = RAGService()
        service.index = Mock()
        service.index.fetch.return_value = SimpleNamespace(vectors={})
        first = result("SEC. 8. First condition.", index=1)
        later = result("Last condition. SEC. 9. Next.", index=3)
        windows = service._requested_sections([first, later], [("section", "8")], 5)
        self.assertNotIn("Last condition", windows[0].chunk.text)
        self.assertFalse(windows[0].evidence_span["complete"])


if __name__ == "__main__":
    unittest.main()
