from types import SimpleNamespace
from unittest.mock import Mock
import unittest
from scripts.build_versioned_index import missing_chunks
from app.services.corpus_identity import chunk_id


class ResumeTests(unittest.TestCase):
    def setUp(self):
        self.chunk=SimpleNamespace(url='https://example.org/law',chunk_index=0,text='Section 1')
        self.index=Mock()

    def test_missing_record_is_uploaded(self):
        self.index.fetch.return_value=SimpleNamespace(vectors={})
        self.assertEqual(missing_chunks(self.index,[self.chunk],'hash'),[self.chunk])

    def test_matching_record_is_skipped(self):
        metadata=dict(corpus_sha256='hash',text='Section 1',url=self.chunk.url,
                      chunk_index=0,id_schema='canonical-url-v2')
        self.index.fetch.return_value=SimpleNamespace(vectors={chunk_id(self.chunk.url,0):SimpleNamespace(metadata=metadata)})
        self.assertEqual(missing_chunks(self.index,[self.chunk],'hash'),[])
        metadata['text']='Different'
        with self.assertRaises(ValueError): missing_chunks(self.index,[self.chunk],'hash')
