"""Independent protocol-vector verification from the specifications."""
import hashlib
import hmac
import json
import shutil
import subprocess
import tempfile
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


def verify_chunks(document):
    assert document['version'] == 1
    assert document['hash'] == 'SHA-256'
    assert len(document['hash_vectors']) == 10
    assert len(document['size_vectors']) == 9
    for vector in document['hash_vectors']:
        source = vector['input']
        if 'hex' in source:
            data = bytes.fromhex(source['hex'])
        else:
            assert source['pattern'] == 'index-mod-251'
            data = bytes(index % 251 for index in range(source['length']))
        assert hashlib.sha256(data).hexdigest() == vector['sha256_hex'], vector['id']
    for vector in document['size_vectors']:
        size = int(vector['file_size'])
        assert 0 <= size < 2**64
        if size <= 64 * 1024**2:
            expected = 64 * 1024
        elif size <= 16 * 1024**3:
            expected = 256 * 1024
        else:
            expected = 1024**2
        assert vector['chunk_size'] == expected
    return len(document['hash_vectors']) + len(document['size_vectors'])


def openssl_binary():
    candidates = [shutil.which('openssl'), '/opt/homebrew/opt/openssl@3/bin/openssl']
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            version = subprocess.check_output([candidate, 'version'], text=True)
            if version.startswith('OpenSSL 3.'):
                return candidate
    raise RuntimeError('Identity vectors require an OpenSSL 3 CLI')


def identity_reference(document):
    """Native OpenSSL keys/signatures over the ADR 004 record descriptions."""
    openssl = openssl_binary()
    with tempfile.TemporaryDirectory(prefix='openmesh-public-vectors-') as directory:
        root = Path(directory)
        public = {}
        for role, oid in [('root', '70'), ('device_signing', '70'), ('device_encryption', '6e')]:
            seed = bytes.fromhex(document[role + '_seed_hex'])
            assert len(seed) == 32
            der = bytes.fromhex('302e020100300506032b65' + oid + '04220420') + seed
            key_path = root / (role + '.der')
            key_path.write_bytes(der)
            spki = subprocess.check_output([openssl, 'pkey', '-inform', 'DER', '-in', str(key_path),
                                            '-pubout', '-outform', 'DER'])
            prefix = bytes.fromhex('302a300506032b65' + oid + '032100')
            assert spki.startswith(prefix) and len(spki) == 44
            public[role] = spki[len(prefix):].hex()

        def sign(unsigned):
            message = root / 'message.cbor'
            message.write_bytes(cbor_reference(unsigned))
            signature = subprocess.check_output([openssl, 'pkeyutl', '-sign', '-rawin',
                                                '-inkey', str(root / 'root.der'), '-keyform', 'DER',
                                                '-in', str(message)])
            assert len(signature) == 64
            return signature.hex()

        fields = [['v', 1], ['device_pub_sign', {'$bytes': public['device_signing']}],
                  ['device_pub_dh', {'$bytes': public['device_encryption']}],
                  ['created', int(document['created'])], ['expiry', int(document['expiry'])]]
        signature = sign({'$map': fields})
        certificate = cbor_reference({'$map': fields + [['sig', {'$bytes': signature}]]})
        revoked = [['v', 1], ['certificate_hash', {'$bytes': hashlib.sha256(certificate).hexdigest()}],
                   ['revoked', int(document['revoked'])]]
        revocation_signature = sign({'$map': revoked})
        revocation = cbor_reference({'$map': revoked + [['sig', {'$bytes': revocation_signature}]]})
        return {'root_public_hex': public['root'], 'device_signing_public_hex': public['device_signing'],
                'device_encryption_public_hex': public['device_encryption'],
                'certificate_hex': certificate.hex(), 'revocation_hex': revocation.hex()}


def verify_identity(document):
    assert document['version'] == 1
    expected = identity_reference(document)
    for field, value in expected.items():
        assert document[field] == value, field
    return len(expected)


def verify_hpke(document):
    """RFC 9180 sections 4.1, 5.1 and 6.1, fixed Base suite and sequence zero."""
    assert document['version'] == 1
    assert len(document['vectors']) == 1
    openssl = openssl_binary()
    kem_suite = b'KEM\x00\x20'
    suite = b'HPKE\x00\x20\x00\x01\x00\x02'

    def extract(salt, label, ikm, suite_id=suite):
        return hmac.new(salt or bytes(32), b'HPKE-v1' + suite_id + label + ikm, hashlib.sha256).digest()

    def expand(prk, label, info, length, suite_id=suite):
        assert 0 < length <= 32
        labeled = length.to_bytes(2, 'big') + b'HPKE-v1' + suite_id + label + info
        return hmac.new(prk, labeled + b'\x01', hashlib.sha256).digest()[:length]

    checked = 0
    for vector in document['vectors']:
        assert (vector['mode'], vector['kem_id'], vector['kdf_id'], vector['aead_id']) == (0, 32, 1, 2)
        with tempfile.TemporaryDirectory(prefix='openmesh-hpke-public-vectors-') as directory:
            root = Path(directory)
            public = {}
            for role in ['E', 'R']:
                seed = bytes.fromhex(vector['sk' + role + 'm'])
                assert len(seed) == 32
                private = root / (role + '.der')
                private.write_bytes(bytes.fromhex('302e020100300506032b656e04220420') + seed)
                spki = subprocess.check_output([openssl, 'pkey', '-inform', 'DER', '-in', str(private),
                                                '-pubout', '-outform', 'DER'])
                assert spki[:12] == bytes.fromhex('302a300506032b656e032100') and len(spki) == 44
                public[role] = spki[12:]
            peer = root / 'peer.der'
            peer.write_bytes(bytes.fromhex('302a300506032b656e032100') + public['R'])
            dh = subprocess.check_output([openssl, 'pkeyutl', '-derive', '-inkey', str(root / 'E.der'),
                                          '-keyform', 'DER', '-peerkey', str(peer), '-peerform', 'DER'])
        assert len(dh) == 32 and dh != bytes(32)
        shared = expand(extract(b'', b'eae_prk', dh, kem_suite), b'shared_secret',
                        public['E'] + public['R'], 32, kem_suite)
        context = b'\x00' + extract(b'', b'psk_id_hash', b'') + extract(b'', b'info_hash', bytes.fromhex(vector['info']))
        secret = extract(shared, b'secret', b'')
        key = expand(secret, b'key', context, 32)
        nonce = expand(secret, b'base_nonce', context, 12)
        expected = {'pkEm': public['E'], 'pkRm': public['R'], 'enc': public['E'], 'shared_secret': shared,
                    'key_schedule_context': context, 'secret': secret, 'key': key, 'base_nonce': nonce}
        for field, value in expected.items():
            assert value.hex() == vector[field], field
            checked += 1
        encryption = vector['encryption']
        assert encryption['nonce'] == nonce.hex()
        # Existing Node toolchain supplies the classic cipher API, separate from core WebCrypto.
        script = """import { readFileSync } from 'node:fs';
import { createDecipheriv } from 'node:crypto';
const v = JSON.parse(readFileSync(0, 'utf8'));
const cipher = Buffer.from(v.ct, 'hex');
const decipher = createDecipheriv('aes-256-gcm', Buffer.from(v.key, 'hex'), Buffer.from(v.nonce, 'hex'));
decipher.setAAD(Buffer.from(v.aad, 'hex'));
decipher.setAuthTag(cipher.subarray(-16));
process.stdout.write(Buffer.concat([decipher.update(cipher.subarray(0, -16)), decipher.final()]).toString('hex'));
"""
        decrypted = subprocess.check_output(['node', '--input-type=module', '-e', script], text=True,
                                             input=json.dumps({**encryption, 'key': key.hex(), 'nonce': nonce.hex()}))
        assert decrypted == encryption['pt']
        checked += 1
    return checked


def main():
    directory = Path(__file__).resolve().parent.parent / 'packages' / 'test-vectors'
    verifiers = {'tags.json': verify_tags, 'cbor.json': verify_cbor, 'chunks.json': verify_chunks,
                 'identity.json': verify_identity, 'hpke.json': verify_hpke}
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
