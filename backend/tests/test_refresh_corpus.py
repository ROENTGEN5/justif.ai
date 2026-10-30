import unittest
from unittest.mock import Mock, patch
import httpx
from scripts.refresh_corpus import download, Body


class RefreshTests(unittest.TestCase):
    @patch('scripts.refresh_corpus.time.sleep')
    def test_transient_failure_retries(self, sleep):
        client = Mock()
        response = Mock(text='official text', status_code=200)
        client.get.side_effect = [httpx.ConnectError('offline'), response]
        self.assertEqual(download(client, 'https://example.org'), 'official text')
        self.assertEqual(client.get.call_count, 2)

    @patch('scripts.refresh_corpus.time.sleep')
    def test_permanent_failure_is_not_hidden(self, sleep):
        client = Mock()
        client.get.side_effect = httpx.ConnectError('offline')
        with self.assertRaises(httpx.ConnectError): download(client, 'https://example.org')
        self.assertEqual(client.get.call_count, 3)

    def test_only_document_body_is_extracted(self):
        parser = Body()
        parser.feed('<div>navigation</div><div class="single_content"><h2>Law</h2><div>Section 1</div></div><div>footer</div>')
        text = ''.join(parser.parts)
        self.assertIn('Section 1', text)
        self.assertNotIn('navigation', text)
        self.assertNotIn('footer', text)
