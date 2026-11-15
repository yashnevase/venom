"""Independent BIP-39 entropy and OpenMesh HKDF/root-public-key fixtures."""
import hashlib
import hmac
import json
from pathlib import Path
import sys
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = Path(__file__).resolve().parents[2]
WORDLIST = ROOT / 'packages/core/src/data/bip39-english.txt'


def phrase_for(entropy, words):
    bits = ''.join(format(byte, '08b') for byte in entropy)
    bits += format(hashlib.sha256(entropy).digest()[0], '08b')
    return ' '.join(words[int(bits[index:index + 11], 2)] for index in range(0, 264, 11))


def root_for(entropy):
    extracted = hmac.new(b'openmesh-root-v1', entropy, hashlib.sha256).digest()
    return hmac.new(extracted, b'ed25519-root\x01', hashlib.sha256).digest()


def build():
    raw = WORDLIST.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == '2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda'
    words = raw.decode().splitlines()
    assert len(words) == len(set(words)) == 2048 and words == sorted(words)
    published = json.loads((ROOT / 'packages/test-vectors/bip39-published.json').read_text())
    vectors = []
    for index, item in enumerate(published['vectors']):
        entropy = bytes.fromhex(item['entropy_hex'])
        assert phrase_for(entropy, words) == item['phrase']
        vectors.append(('published-' + str(index), entropy))
    for index in range(64):
        entropy = hashlib.sha256(b'openmesh-public-recovery-fixture' + index.to_bytes(4, 'big')).digest()
        vectors.append(('generated-' + str(index), entropy))
    cases = []
    for name, entropy in vectors:
        root = root_for(entropy)
        public = Ed25519PrivateKey.from_private_bytes(root).public_key().public_bytes_raw()
        cases.append({'id': name, 'entropy_hex': entropy.hex(), 'phrase': phrase_for(entropy, words),
                      'root_seed_hex': root.hex(), 'root_public_hex': public.hex()})
    return {'v': 1, 'generator': 'Python stdlib hashlib/hmac and cryptography50.0.2',
            'wordlist_sha256': hashlib.sha256(raw).hexdigest(), 'vectors': cases}


def main():
    document = build()
    path = ROOT / 'packages/test-vectors/recovery.json'
    expected = json.dumps(document, indent=2) + '\n'
    if '--check' in sys.argv:
        if path.read_text() != expected:
            raise ValueError('Recovery vector regeneration differs')
    else:
        path.write_text(expected)
    print(json.dumps({'recovery_vectors': len(document['vectors']), 'bytes': path.stat().st_size,
                      'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    main()
