import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.services.law_lookup import named_laws, title_variants
from app.services.rag import RAGService


class NamedLawTests(unittest.TestCase):
    def test_aliases_and_number_formats_match_one_identifier(self):
        refs = named_laws("Compare R.A. No. 9,507 with REPUBLIC ACT NO. 9507, and PD 9507.")
        self.assertEqual([(r['family'], r['number']) for r in refs],
                         [('Republic Act', '9507'), ('Presidential Decree', '9507')])
        self.assertIn('Republic Act No. 9507', title_variants(refs[0]))
        self.assertNotIn('Republic Act No. 6640', title_variants(named_laws('RA 649')[0]))

    def test_sections_and_bare_numbers_are_not_named_laws(self):
        self.assertEqual(named_laws('Explain Article 297, Section 16 and my 30-day deadline.'), [])

    def test_implementing_rules_remain_distinct_from_the_statute(self):
        refs = named_laws('Compare RA 10173 and the IRR of Republic Act No. 10173')
        self.assertEqual(len(refs), 2)
        self.assertFalse(refs[0]['implementing_rules'])
        self.assertTrue(refs[1]['implementing_rules'])
        self.assertIn('Irr of Republic Act No. 10173', title_variants(refs[1]))
        self.assertNotIn('Republic Act No. 10173', title_variants(refs[1]))

    def test_named_law_uses_original_question_and_preserves_type_filter(self):
        service = RAGService()
        service._loaded = True
        service.index = Mock()
        service.index.query.return_value = SimpleNamespace(matches=[])
        with patch('app.services.rag.embed_query', return_value=[.1]):
            results = service.search('rewriter added RA 1234', law_query='What does RA 9507 say?',
                                     law_types=['Republic Acts'], strict=True)
        self.assertEqual(results, [])
        service.index.query.assert_called_once()
        filters = service.index.query.call_args.kwargs['filter']['$and']
        self.assertIn('Republic Act No. 9507', filters[0]['short_title']['$in'])
        self.assertNotIn('Republic Act No. 1234', filters[0]['short_title']['$in'])
        self.assertEqual(filters[1], {'label': {'$in': ['Republic Acts']}})

    def test_missing_named_law_does_not_fall_back_to_other_laws(self):
        service = RAGService()
        service._loaded = True
        service.index = Mock()
        service.index.query.return_value = SimpleNamespace(matches=[])
        with patch('app.services.rag.embed_query', return_value=[.1]):
            self.assertEqual(service.search('RA 99999', strict=True), [])
        self.assertEqual(service.index.query.call_count, 1)

    def test_comparison_includes_each_requested_law(self):
        def match(title, body):
            return SimpleNamespace(metadata={'short_title': title, 'text': body,
                'url': 'https://example.test/' + title, 'chunk_index': 0}, score=.9)
        service = RAGService()
        service._loaded = True
        service.index = Mock()
        service.index.query.side_effect = [SimpleNamespace(matches=[match('Republic Act No. 649','Rule A')]),
                                          SimpleNamespace(matches=[match('Republic Act No. 9507','Rule B')])]
        with patch('app.services.rag.embed_query', return_value=[.1]):
            results = service.search('Compare RA 649 and RA 9507', top_k=2, strict=True)
        self.assertEqual([r.chunk.short_title for r in results], ['Republic Act No. 649', 'Republic Act No. 9507'])
