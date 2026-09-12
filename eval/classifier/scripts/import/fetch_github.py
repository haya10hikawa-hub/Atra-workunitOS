"""Authenticated public-only GitHub GET acquisition; credentials stay inside gh."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
APPROVED = {'VOICEVOX/voicevox', 'sakura-editor/sakura', 'vivliostyle/vivliostyle.js',
            'KazumaProject/JapaneseKeyboard', 'Project-PLATEAU/PLATEAU-SDK-for-Unity'}


def get(endpoint):
    result = subprocess.run(['gh', 'api', '--method', 'GET', endpoint], capture_output=True, timeout=45, check=False)
    if result.returncode:
        raise RuntimeError('GitHub GET failed; check authentication/rate limits separately')
    if len(result.stdout) > 8_000_000:
        raise ValueError('GitHub response exceeds 8MB budget')
    json.loads(result.stdout)
    return result.stdout


def fetch(repository, resource, name):
    if repository not in APPROVED or not re.fullmatch(r'[a-z0-9_-]+', name):
        raise ValueError('repository or output name outside acquisition scope')
    if not re.fullmatch(r'(?:issues(?:/\d+/comments)?(?:\?[a-zA-Z0-9_=&%-]+)?|license|)', resource):
        raise ValueError('resource must be a scoped read-only issue/comment/license endpoint')
    metadata = json.loads(get('repos/' + repository))
    if metadata.get('private') is not False:
        raise ValueError('only explicitly public repositories are allowed')
    endpoint = 'repos/' + repository + ('/' + resource if resource else '')
    payload = get(endpoint) if resource else json.dumps(metadata).encode()
    digest = hashlib.sha256(payload).hexdigest()
    directory = ROOT / 'external_sources/sandbox' / name
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / (digest + '.raw')
    if not path.exists():
        with path.open('xb') as stream:
            stream.write(payload)
    receipt = {'url': 'https://api.github.com/' + endpoint, 'retrieved_at': datetime.now(timezone.utc).isoformat(),
               'sha256': digest, 'bytes': len(payload), 'path': str(path.relative_to(ROOT)),
               'public_repository_confirmed': metadata['full_name'], 'boundary': 'public-source-sandbox/v1', 'trust': 'untrusted'}
    receipt_path = directory / (digest + '.receipt.json')
    if not receipt_path.exists():
        with receipt_path.open('x') as stream:
            json.dump(receipt, stream, indent=2)
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('repository')
    parser.add_argument('resource')
    parser.add_argument('name')
    args = parser.parse_args()
    try:
        print(json.dumps(fetch(args.repository, args.resource, args.name)))
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(json.dumps({'status': 'FAILED', 'reason': str(error)[:200]}))
        raise SystemExit(1) from None
