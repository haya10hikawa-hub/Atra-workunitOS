"""Inert, bounded XML-to-JSON snapshots with verifiable archive lineage."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET


def records_from_archive(archive, member):
    if not member.endswith('.xml') or '..' in Path(member).parts:
        raise ValueError('unsafe XML member')
    with zipfile.ZipFile(archive) as package:
        info = package.getinfo(member)
        if info.file_size > 40_000_000:
            raise ValueError('XML member exceeds 40MB budget')
        with package.open(info) as stream:
            raw = stream.read(40_000_001)
    if len(raw) > 40_000_000 or b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:
        raise ValueError('unsafe XML declaration or size')
    root = ET.fromstring(raw)
    if root.tag not in ['slack', 'discord']:
        raise ValueError('unsupported chat XML root')
    records = [{'text': item.findtext('text') or '', 'user': item.findtext('user') or 'unknown',
                'timestamp_text': item.findtext('ts') or '', 'conversation_id': item.get('conversation_id')}
               for item in root.findall('message')]
    return root.tag, records, hashlib.sha256(raw).hexdigest()


def extract_snapshot(archive, member, output, archive_reference):
    provider, records, member_hash = records_from_archive(archive, member)
    result = {'extraction': {'format': 'public-chat-xml/v1', 'archive_path': archive_reference,
                             'member': member, 'member_sha256': member_hash}, 'provider': provider, 'records': records}
    with Path(output).open('x') as stream:
        json.dump(result, stream, ensure_ascii=False, separators=(',', ':'))
    return {'records': len(records), 'provider': provider, 'member_sha256': member_hash}


def verify_snapshot(snapshot, archive):
    value = json.loads(Path(snapshot).read_text())
    provider, records, member_hash = records_from_archive(archive, value['extraction']['member'])
    return value['provider'] == provider and value['records'] == records and value['extraction']['member_sha256'] == member_hash


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['extract', 'verify'])
    parser.add_argument('archive')
    parser.add_argument('input')
    parser.add_argument('--output')
    parser.add_argument('--archive-reference')
    args = parser.parse_args()
    try:
        if args.command == 'verify':
            valid = verify_snapshot(args.input, args.archive)
            print(json.dumps({'valid': valid}))
            raise SystemExit(0 if valid else 1)
        if not args.output or not args.archive_reference:
            raise ValueError('output and archive reference required')
        print(json.dumps(extract_snapshot(args.archive, args.input, args.output, args.archive_reference)))
    except (OSError, ValueError, KeyError, ET.ParseError, zipfile.BadZipFile) as error:
        print(json.dumps({'error': type(error).__name__, 'message': str(error)[:200]}))
        raise SystemExit(1) from None


if __name__ == '__main__':
    main()
