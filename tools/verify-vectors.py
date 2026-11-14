"""Independent tag verifier from docs/04 section 5. No TypeScript imports."""
import hashlib
import hmac
import json
from pathlib import Path


def main():
    directory = Path(__file__).resolve().parent.parent / 'packages' / 'test-vectors'
    documents = sorted(directory.glob('*.json'))
    checked = 0
    for path in documents:
        # Unknown suites fail closed until their independent verifier is supplied.
        if path.name != 'tags.json':
            raise ValueError(f'No independent verifier for {path.name}')
        document = json.loads(path.read_text())
        assert document['version'] == 1
        assert document['encoding'] == 'u64-big-endian'
        assert len(document['vectors']) >= 8
        for vector in document['vectors']:
            key = bytes.fromhex(vector['key_hex'])
            counter = int(vector['counter'])
            assert len(key) == 32
            assert 0 <= counter < 2**64
            counter_bytes = counter.to_bytes(8, byteorder='big', signed=False)
            expected = hmac.new(key, b'om-tag-v1' + counter_bytes, hashlib.sha256).digest()[:16]
            assert hmac.compare_digest(expected.hex(), vector['tag_hex']), vector['id']
            checked += 1
    assert checked > 0, 'No vectors verified'
    print(f'VEC-TAG — {checked} independent Python checks passed')


if __name__ == '__main__':
    main()
