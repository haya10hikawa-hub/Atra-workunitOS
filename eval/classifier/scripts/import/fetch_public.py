"""Bounded, read-only acquisition into the public-data sandbox. No model calls."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
import urllib.parse
from datetime import datetime, timezone

HOSTS = {'api.github.com', 'raw.githubusercontent.com', 'zenodo.org',
         'smartshark.github.io', 'api.figshare.com', 'api.datacite.org',
         'en.wikipedia.org', 'ja.wikipedia.org', 'www.mediawiki.org',
         'lists.apache.org', 'data.researchdatafinder.org'}
ROOT = Path(__file__).resolve().parents[2]


def checked_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in HOSTS or parsed.username or parsed.password:
        raise ValueError('URL outside public-source allowlist')
    return url


class PublicRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        checked_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, name, limit=8_000_000):
    checked_url(url)
    if not name or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-_' for c in name):
        raise ValueError('unsafe output name')
    destination = ROOT / 'external_sources' / 'sandbox' / name
    destination.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={'User-Agent': 'Atra-Public-Benchmark/0.1', 'Accept': 'application/json'})
    with urllib.request.build_opener(PublicRedirect()).open(request, timeout=40) as response:
        payload = response.read(limit + 1)
        if len(payload) > limit:
            raise ValueError('acquisition size budget exceeded')
        digest = hashlib.sha256(payload).hexdigest()
        raw = destination / (digest + '.raw')
        if not raw.exists():
            with raw.open('xb') as stream:
                stream.write(payload)
        receipt = {'url': url, 'retrieved_at': datetime.now(timezone.utc).isoformat(),
                   'sha256': digest, 'bytes': len(payload), 'path': str(raw.relative_to(ROOT)),
                   'etag': response.headers.get('ETag'), 'last_modified': response.headers.get('Last-Modified'),
                   'trust': 'untrusted', 'boundary': 'public-source-sandbox/v1'}
        receipt_path = destination / (digest + '.receipt.json')
        if not receipt_path.exists():
            with receipt_path.open('x') as stream:
                json.dump(receipt, stream, ensure_ascii=False, indent=2)
        return receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('url')
    parser.add_argument('name')
    args = parser.parse_args()
    try:
        print(json.dumps(fetch(args.url, args.name), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'status': 'ACQUISITION_FAILED', 'error_type': type(error).__name__, 'error': str(error)[:240]}))
        raise SystemExit(1) from None


if __name__ == '__main__':
    main()
