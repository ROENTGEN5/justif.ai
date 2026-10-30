import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.services.rag import ChunkMetadata, RAGSearchError, RAGService, SearchResult, select_evidence


def result(text, score=.9, url="https://example.test/law", title="Law", index=0):
    return SearchResult(ChunkMetadata(title, title, "act", "2020", url,
                                     "Acts", index, 10, text), score)


class RetrievalTests(unittest.TestCase):
    def test_requested_concepts_outrank_adjacent_employment_topics(self):
        strike = result("A worker participating in an illegal strike may lose employment status.", .94)
        pay = result("Separation pay depends on the applicable grounds and conditions.", .90, index=1)
        dismissal = result("Illegal dismissal remedies depend on the applicable conditions.", .90, index=2)
        selected = select_evidence([strike, pay, dismissal], 2,
                                   query="severance pay separation pay illegal dismissal")
        self.assertEqual(set(selected), {pay, dismissal})

    def test_phrase_matching_is_body_only_and_does_not_filter_paraphrases(self):
        unrelated = result("[Illegal dismissal separation pay]\nStrike participation rules.", .90)
        relevant = result("Illegal dismissal and separation pay conditions.", .90, index=1)
        paraphrase = result("Compensation following termination of employment.", .89, index=2)
        selected = select_evidence([unrelated, relevant, paraphrase], 3,
                                   query="separation pay illegal dismissal")
        self.assertIs(selected[0], relevant)
        self.assertIn(paraphrase, selected)

    def test_mirrored_content_does_not_fill_evidence_slots(self):
        first = result("[Law] [Acts]\nSection 1. A person may request access to their own records.")
        mirror = result("[Other label] [Register]\nSection 1. A person may request access to their own records.", .89, "https://example.test/mirror")
        distinct = result("Section 2. Access may be restricted where disclosure prejudices another person's rights.", .88, index=1)
        self.assertEqual(select_evidence([first, mirror, distinct], 2), [first, distinct])

    def test_changed_legal_numbers_and_overlapping_passages_are_preserved(self):
        common = "Every person subject to this requirement must submit the prescribed application with supporting information to the competent authority "
        first = result(common + "within 30 days after receiving notice.")
        changed = result(common + "within 60 days after receiving notice.", .89, index=1)
        overlap = result("supporting information to the competent authority within 30 days after receiving notice. An extension requires written reasons.", .88, index=2)
        self.assertEqual(select_evidence([first, changed, overlap], 3), [first, changed, overlap])
        mandatory = result(common.replace("must", "may") + "within 30 days after receiving notice.", .87, index=3)
        self.assertEqual(len(select_evidence([first, mandatory], 2)), 2)

    def test_contents_demoted_but_numbered_provisions_preserved(self):
        contents = result("1. Title 2. Policy 3. Definitions 4. Scope 5. Exceptions 6. Duties 7. Powers 8. Penalties", .95)
        provision = result("Section 5. The applicant must be given a written decision stating the reasons and applicable review process.", .90, index=5)
        self.assertEqual(select_evidence([contents, provision], 1), [provision])
        numbered = " ".join(f"{i}. The authority shall give the person written notice of the proposed action and provide an opportunity to explain the relevant circumstances before deciding the matter." for i in range(1, 8))
        substantive = result(numbered, .96, index=8)
        self.assertEqual(select_evidence([substantive, provision], 1), [substantive])

    def test_identical_titles_at_different_urls_keep_citation_identity(self):
        first = result("First document text", url="https://example.test/a")
        second = result("Second document text", url="https://example.test/b")
        service = RAGService()
        sources = service.get_sources([first, second])
        self.assertEqual(len(sources), 2)
        context = service.format_context_from_sources([first, second], sources)
        self.assertIn("--- Law Source 2 ---", context)
        self.assertIn("URL: https://example.test/b\nContent:\nSecond document text", context)

    def test_source_url_preserves_titleless_evidence(self):
        item = result("Article 1. A relevant provision.", title="")
        service = RAGService()
        selected = select_evidence([item], 1)
        sources = service.get_sources(selected)
        self.assertEqual(len(sources), 1)
        self.assertIn(item.chunk.text, service.format_context_from_sources(selected, sources))

    def test_search_expands_candidates_and_preserves_filter(self):
        service = RAGService()
        service._loaded = True
        service.index = Mock()
        service.index.query.return_value = SimpleNamespace(matches=[SimpleNamespace(
            metadata={"text": "A relevant rule", "url": "https://example.test/a"}, score=.9)])
        with patch("app.services.rag.embed_query", return_value=[0.1]):
            found = service.search("question", top_k=5, law_types=["Acts"], strict=True)
        self.assertEqual(len(found), 1)
        self.assertGreater(service.index.query.call_args.kwargs["top_k"], 5)
        self.assertEqual(service.index.query.call_args.kwargs["filter"], {"label": {"$in": ["Acts"]}})

    def test_strict_failures_differ_from_successful_empty_search(self):
        service = RAGService()
        with self.assertRaises(RAGSearchError):
            service.search("question", strict=True)
        service._loaded = True
        service.index = Mock()
        service.index.query.return_value = SimpleNamespace(matches=[])
        with patch("app.services.rag.embed_query", return_value=[0.1]):
            self.assertEqual(service.search("question", strict=True), [])
            service.index.query.side_effect = RuntimeError("offline")
            # Capture expected outage logs so passing tests do not print tracebacks.
            with self.assertLogs("app.services.rag", level="ERROR") as logs:
                with self.assertRaises(RAGSearchError):
                    service.search("question", strict=True)
                self.assertEqual(service.search("question"), [])
            self.assertEqual(len(logs.records), 2)
            self.assertTrue(all("offline" in record.getMessage() for record in logs.records))

    def test_canonical_section_lookup_uses_in_memory_cache(self):
        service = RAGService()
        service._loaded = True
        service.index = Mock()
        service.index.query.return_value = SimpleNamespace(matches=[SimpleNamespace(
            metadata={"short_title": "Republic Act No. 10173", "text": "SEC. 12. Criteria for Lawful Processing.",
                      "url": "https://example.test/ra10173", "chunk_index": 0, "total_chunks": 1}, score=.95)])
        with patch("app.services.rag.embed_query", return_value=[0.1]) as embed_mock:
            first = service.search("RA 10173 Section 12", strict=True)
            second = service.search("RA 10173 Section 12", strict=True)
        self.assertEqual(len(first), 1)
        self.assertEqual(len(second), 1)
        embed_mock.assert_called_once()
        service.index.query.assert_called_once()


if __name__ == "__main__":
    unittest.main()
