"""Independent Tag and CBOR vector verification from the specifications."""
import hashlib
import hmac
import json
from pathlib import Path


def cbor_head(major, argument):
    """RFC 8949 major-type argument in its preferred, shortest representation."""
    assert 0 <= argument < 2**64
    if argument < 24:
        return bytes([(major << 5) | argument])
    for width, additional in [(1, 24), (2, 25), (4, 26), (8, 27)]:
        if argument < 1 << (width * 8):
            return bytes([(major << 5) | additional]) + argument.to_bytes(width, 'big')
    raise ValueError('Integer out of range')


def cbor_reference(value):
    """Independent fixture encoder. Debug markers represent bytes, maps and bigint."""
    if value is None:
        return b'\xf6'
    if isinstance(value, bool):
        return b'\xf5' if value else b'\xf4'
    if isinstance(value, int):
        return cbor_head(0, value) if value >= 0 else cbor_head(1, -1 - value)
    if isinstance(value, str):
        encoded = value.encode('utf-8')
        return cbor_head(3, len(encoded)) + encoded
    if isinstance(value, list):
        return cbor_head(4, len(value)) + b''.join(cbor_reference(item) for item in value)
    if isinstance(value, dict):
        if set(value) == {'$int'}:
            return cbor_reference(int(value['$int']))
        if set(value) == {'$bytes'}:
            encoded = bytes.fromhex(value['$bytes'])
            return cbor_head(2, len(encoded)) + encoded
        if set(value) == {'$map'}:
            entries = [(cbor_reference(key), cbor_reference(item)) for key, item in value['$map']]
            entries.sort(key=lambda entry: entry[0])
            assert len({key for key, _ in entries}) == len(entries)
            return cbor_head(5, len(entries)) + b''.join(key + item for key, item in entries)
    raise ValueError('Unsupported fixture value')


def verify_tags(document):
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
    return len(document['vectors'])


def verify_cbor(document):
    assert document['version'] == 1
    assert document['encoding'] == 'rfc8949-core-deterministic'
    assert len(document['vectors']) >= 16
    for vector in document['vectors']:
        assert cbor_reference(vector['value']).hex() == vector['cbor_hex'], vector['id']
    return len(document['vectors'])


def main():
    directory = Path(__file__).resolve().parent.parent / 'packages' / 'test-vectors'
    verifiers = {'tags.json': verify_tags, 'cbor.json': verify_cbor}
    checked = 0
    for path in sorted(directory.glob('*.json')):
        if path.name not in verifiers:
            raise ValueError(f'No independent verifier for {path.name}')
        count = verifiers[path.name](json.loads(path.read_text()))
        checked += count
        print(f'{path.stem} — {count} independent Python checks passed')
    assert checked > 0, 'No vectors verified'


if __name__ == '__main__':
    main()
