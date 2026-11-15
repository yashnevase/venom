"""Public backup fixtures generated independently of the TypeScript implementation."""
import hashlib
import hmac
import json
from pathlib import Path
import sys
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from envelope_vectors import cbor
from recovery_vectors import root_for

ROOT = Path(__file__).resolve().parents[2]


def build():
    vectors = []
    for index, snapshot in enumerate([b'', b'\x01\x02\x03', bytes(range(256))]):
        entropy = bytes([30 + index]) * 32
        signing = Ed25519PrivateKey.from_private_bytes(root_for(entropy))
        header = {'v': 1, 'root': signing.public_key().public_bytes_raw(),
                  'snapshot_id': bytes([40 + index]) * 16, 'created': 1794700800}
        transcript = b'openmesh-backup-sign-v1' + hashlib.sha256(cbor(header)).digest() + hashlib.sha256(snapshot).digest()
        signature = signing.sign(transcript)
        salt = bytes([50 + index]) * 32
        nonce = bytes([60 + index]) * 12
        extracted = hmac.new(salt, entropy, hashlib.sha256).digest()
        key = hmac.new(extracted, b'openmesh-backup-key-v1\x01', hashlib.sha256).digest()
        aad = b'openmesh-backup-aad-v1' + cbor(header) + salt
        ciphertext = AESGCM(key).encrypt(nonce, cbor([snapshot, signature]), aad)
        wire = b'\x01' + cbor([header, salt, nonce, ciphertext])
        bad_signature = bytes([signature[0] ^ 1]) + signature[1:]
        rejected = b'\x01' + cbor([header, salt, nonce, AESGCM(key).encrypt(nonce, cbor([snapshot, bad_signature]), aad)])
        vectors.append({'id': 'backup-' + str(index), 'entropy_hex': entropy.hex(),
                        'snapshot_hex': snapshot.hex(), 'wire_hex': wire.hex(), 'invalid_signature_hex': rejected.hex()})
    return {'v': 1, 'generator': 'Python cryptography50.0.2, hashlib/hmac, independent CBOR', 'vectors': vectors}


def main():
    document = build()
    path = ROOT / 'packages/test-vectors/backups.json'
    expected = json.dumps(document, indent=2) + '\n'
    if '--check' in sys.argv:
        if path.read_text() != expected:
            raise ValueError('Backup regeneration differs')
    else:
        path.write_text(expected)
    print(json.dumps({'backup_cases': 2 * len(document['vectors']), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    main()
