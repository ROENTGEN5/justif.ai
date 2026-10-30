import unittest
from app.services.corpus_identity import chunk_id


class CorpusIdentityTests(unittest.TestCase):
    def test_source_documents_cannot_share_ids(self):
        self.assertNotEqual(chunk_id('https://example.com/law/1',0),chunk_id('https://example.com/law/2',0))
        self.assertNotEqual(chunk_id('https://example.com/law/1',0),chunk_id('https://example.com/law/1',1))
    def test_scheme_host_fragment_normalization(self):
        self.assertEqual(chunk_id('http://EXAMPLE.com/law/1/#section',0),chunk_id('https://example.com/law/1',0))
    def test_missing_url_is_rejected(self):
        with self.assertRaises(ValueError): chunk_id('',0)
