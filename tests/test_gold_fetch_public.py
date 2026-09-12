"""Offline acquisition boundary tests; no external requests."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('gold_fetch', Path(__file__).parents[1] / 'eval/classifier/scripts/import/fetch_public.py')
FETCH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FETCH)
XML_SPEC = importlib.util.spec_from_file_location('gold_xml', Path(__file__).parents[1] / 'eval/classifier/scripts/import/xml_snapshot.py')
XML = importlib.util.module_from_spec(XML_SPEC)
XML_SPEC.loader.exec_module(XML)


class Response(io.BytesIO):
    headers = {'ETag': 'test-etag'}


class AcquisitionTest(unittest.TestCase):
    def test_url_allowlist_blocks_credentials_and_private_hosts(self):
        for url in ['http://api.github.com/x', 'https://127.0.0.1/x', 'https://user:pass@api.github.com/x', 'https://evil.example/x']:
            with self.assertRaises(ValueError):
                FETCH.checked_url(url)
        self.assertEqual(FETCH.checked_url('https://api.github.com/x'), 'https://api.github.com/x')

    def test_unsafe_name_is_rejected_before_network(self):
        with self.assertRaises(ValueError):
            FETCH.fetch('https://api.github.com/x', '../escape')

    def test_receipt_hash_and_append_only_bytes(self):
        with tempfile.TemporaryDirectory(prefix='atra-gold-fetch-') as directory:
            with patch.object(FETCH, 'ROOT', Path(directory)), patch.object(FETCH.urllib.request, 'build_opener') as opener:
                opener.return_value.open.side_effect = [Response(b'{"public":true}'), Response(b'{"public":true}')]
                first = FETCH.fetch('https://api.github.com/x', 'test')
                second = FETCH.fetch('https://api.github.com/x', 'test')
                self.assertEqual(first['sha256'], second['sha256'])
                self.assertEqual((Path(directory) / first['path']).read_bytes(), b'{"public":true}')
                receipts = list(Path(directory).rglob('*.receipt.json'))
                self.assertEqual(len(receipts), 1)
                self.assertEqual(json.loads(receipts[0].read_text())['retrieved_at'], first['retrieved_at'])

    def test_size_limit_does_not_write_oversized_source(self):
        with tempfile.TemporaryDirectory(prefix='atra-gold-fetch-') as directory:
            with patch.object(FETCH, 'ROOT', Path(directory)), patch.object(FETCH.urllib.request, 'build_opener') as opener:
                opener.return_value.open.return_value = Response(b'oversized')
                with self.assertRaisesRegex(ValueError, 'budget'):
                    FETCH.fetch('https://api.github.com/x', 'test', limit=3)
                self.assertEqual(list(Path(directory).rglob('*.raw')), [])

    def test_redirect_cannot_escape_allowlist(self):
        with self.assertRaises(ValueError):
            FETCH.PublicRedirect().redirect_request(None, None, 302, '', {}, 'https://evil.example/')

    def test_xml_snapshot_keeps_archive_lineage_and_detects_tampering(self):
        with tempfile.TemporaryDirectory(prefix='atra-gold-xml-') as directory:
            archive, snapshot = Path(directory) / 'input.zip', Path(directory) / 'snapshot.json'
            with zipfile.ZipFile(archive, 'w') as package:
                package.writestr('data/test.xml', '<slack><message conversation_id="1"><text>Fix the test.</text><user>u1</user><ts>2020-01-01T00:00:00</ts></message></slack>')
            result = XML.extract_snapshot(archive, 'data/test.xml', snapshot, 'sandbox/input.zip')
            self.assertEqual(result['records'], 1)
            self.assertTrue(XML.verify_snapshot(snapshot, archive))
            value = json.loads(snapshot.read_text())
            value['records'][0]['text'] = 'invented'
            snapshot.write_text(json.dumps(value))
            self.assertFalse(XML.verify_snapshot(snapshot, archive))

    def test_xml_entities_and_path_escape_fail_closed(self):
        with tempfile.TemporaryDirectory(prefix='atra-gold-xml-') as directory:
            archive = Path(directory) / 'input.zip'
            with zipfile.ZipFile(archive, 'w') as package:
                package.writestr('bad.xml', '<!DOCTYPE slack><slack/>')
            with self.assertRaisesRegex(ValueError, 'unsafe'):
                XML.records_from_archive(archive, 'bad.xml')
            with self.assertRaisesRegex(ValueError, 'unsafe'):
                XML.records_from_archive(archive, '../bad.xml')


if __name__ == '__main__':
    unittest.main()
