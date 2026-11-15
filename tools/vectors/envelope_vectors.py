"""Independent OpenMesh development vectors. All seeds below are public fixtures."""
import hashlib
import hmac
import json
import sys
from pathlib import Path
import zlib
from cryptography.hazmat.primitives.asymmetric import ed25519, x25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

NOW = 1794700800
ROOT = Path(__file__).resolve().parents[2]


def head(major, value):
    if value < 24:
        return bytes([(major << 5) | value])
    for width, marker in [(1, 24), (2, 25), (4, 26), (8, 27)]:
        if value < (1 << (8 * width)):
            return bytes([(major << 5) | marker]) + value.to_bytes(width, 'big')
    raise ValueError('uint64 overflow')


def cbor(value):
    if isinstance(value, int):
        return head(0, value)
    if isinstance(value, bytes):
        return head(2, len(value)) + value
    if isinstance(value, str):
        raw = value.encode('utf-8')
        return head(3, len(raw)) + raw
    if isinstance(value, list):
        return head(4, len(value)) + b''.join(cbor(item) for item in value)
    if isinstance(value, dict):
        pairs = sorted((cbor(key), cbor(item)) for key, item in value.items())
        return head(5, len(pairs)) + b''.join(key + item for key, item in pairs)
    raise TypeError(type(value))


def digest(value):
    return hashlib.sha256(value).digest()


def actor(name, start):
    seeds = [bytes([start + index]) * 32 for index in range(3)]
    root = ed25519.Ed25519PrivateKey.from_private_bytes(seeds[0])
    sign = ed25519.Ed25519PrivateKey.from_private_bytes(seeds[1])
    dh = x25519.X25519PrivateKey.from_private_bytes(seeds[2])
    unsigned = {'v': 1, 'device_pub_sign': sign.public_key().public_bytes_raw(),
                'device_pub_dh': dh.public_key().public_bytes_raw(),
                'created': NOW - 100, 'expiry': NOW + 1000}
    cert = cbor(dict(unsigned, sig=root.sign(cbor(unsigned))))
    root_public = root.public_key().public_bytes_raw()
    reference = cbor([root_public, cert])
    return {'name': name, 'seeds': seeds, 'root': root_public, 'certificate': cert,
            'reference': reference, 'id': digest(reference)[:16], 'sign': sign, 'dh': dh}


def hkdf_extract(salt, material):
    return hmac.new(salt or bytes(32), material, hashlib.sha256).digest()


def hkdf_expand(prk, info, length):
    output, previous, counter = b'', b'', 1
    while len(output) < length:
        previous = hmac.new(prk, previous + info + bytes([counter]), hashlib.sha256).digest()
        output += previous
        counter += 1
    return output[:length]


def extract(suite, salt, label, material):
    return hkdf_extract(salt, b'HPKE-v1' + suite + label + material)


def expand(suite, prk, label, info, length):
    return hkdf_expand(prk, length.to_bytes(2, 'big') + b'HPKE-v1' + suite + label + info, length)


def wrap(recipient, content_key, box_id, seed):
    kem = b'KEM' + bytes.fromhex('0020')
    suite = b'HPKE' + bytes.fromhex('002000010002')
    ephemeral = x25519.X25519PrivateKey.from_private_bytes(seed)
    enc = ephemeral.public_key().public_bytes_raw()
    receiver = recipient['dh'].public_key().public_bytes_raw()
    dh = ephemeral.exchange(recipient['dh'].public_key())
    eae = extract(kem, b'', b'eae_prk', dh)
    shared = expand(kem, eae, b'shared_secret', enc + receiver, 32)
    info = b'openmesh-box-v1' + box_id + recipient['id']
    context = b'\x00' + extract(suite, b'', b'psk_id_hash', b'') + extract(suite, b'', b'info_hash', info)
    secret = extract(suite, shared, b'secret', b'')
    key = expand(suite, secret, b'key', context, 32)
    nonce = expand(suite, secret, b'base_nonce', context, 12)
    return [recipient['id'], enc, AESGCM(key).encrypt(nonce, content_key, b'')]


def envelope(sender, recipients, body, kind, profile, marker, manifest=None, corruption=None, padding_blocks=0):
    raw = cbor(body)
    declared = len(raw) - 1 if corruption == 'decompression-bound' else len(raw)
    compressed = zlib.compress(raw)
    compressed = compressed[:2] + b'\x00\x00\x00\xff\xff' * padding_blocks + compressed[2:]
    q = cbor([kind, sender['reference'], declared, compressed])
    header = {'v': 1, 'box_id': bytes([marker]) * 16, 'profile': profile,
              'tag': bytes([marker + 1]) * 16, 'size': 0, 'created_coarse': NOW}
    if manifest:
        header.update(chunk_size=manifest['chunk_size'], manifest_hash=digest(cbor(manifest)))
    recipients = sorted(recipients, key=lambda item: item['id'])
    candidates = [1024, 4096, 16384]
    if profile != 'small':
        step = header.get('chunk_size', 65536)
        candidates += list(range(step, 2097153, step))
    # Independent binary search over lengths, using actual encoded arrays.
    padded = None
    for bucket in candidates:
        lower, upper = len(q) + 64, bucket
        while lower <= upper:
            length = (lower + upper) // 2
            header['size'] = length
            model = [header, [[r['id'], bytes(32), bytes(48)] for r in recipients], bytes(12), bytes(length + 16)]
            actual = 1 + len(cbor(model))
            if actual == bucket:
                padded = length
                break
            if actual < bucket:
                lower = length + 1
            else:
                upper = length - 1
        if padded is not None:
            break
    if padded is None:
        raise ValueError('no bucket')
    header['size'] = padded
    signed_kind = 1 if corruption == 'kind' else kind
    signed_body = cbor({'text': 'different body'}) if corruption == 'body' else raw
    if corruption == 'attachments':
        changed = dict(body['attachments'][0], name='changed attachment')
        signed_body = cbor({'attachments': [changed]})
    signed_reference = b'different certificate' if corruption == 'certificate' else sender['reference']
    signed_recipients = b'different recipients' if corruption == 'recipients' else b''.join(r['id'] for r in recipients)
    transcript = (b'openmesh-box-v1' + digest(cbor(header)) + digest(signed_recipients)
                  + bytes([signed_kind]) + digest(signed_body) + digest(signed_reference))
    plaintext = q + sender['sign'].sign(transcript) + bytes(padded - len(q) - 64)
    if corruption == 'padding':
        plaintext = plaintext[:-1] + b'\x01'
    content_key = bytes([marker + 2]) * 32
    entries = [wrap(r, content_key, header['box_id'], bytes([marker + 3 + i]) * 32)
               for i, r in enumerate(recipients)]
    nonce = bytes([marker + 4]) * 12
    aad = b'openmesh-payload-v1' + cbor(header) + digest(cbor(entries))
    ciphertext = AESGCM(content_key).encrypt(nonce, plaintext, aad)
    wire = b'\x01' + cbor([header, entries, nonce, ciphertext])
    return wire, digest(cbor(header) + ciphertext), raw


def file_stream(sender, length, corruption=None):
    data = bytes(i % 251 for i in range(length))
    offset = 2 if length else 0
    stream_id, key = bytes([81 + offset]) * 32, bytes([82 + offset]) * 32
    capacity = 65536 - 16
    pieces = [data[i:i + capacity] for i in range(0, len(data), capacity)] or [b'']
    chunks = []
    for index, piece in enumerate(pieces):
        final = index == len(pieces) - 1
        nonce_final = not final if corruption == 'wrong-final' else final
        nonce = index.to_bytes(11, 'big') + bytes([nonce_final])
        aad = stream_id + index.to_bytes(8, 'big') + bytes([final])
        chunks.append(AESGCM(key).encrypt(nonce, piece, aad))
    if corruption == 'reordered':
        chunks.reverse()
    if corruption == 'truncated':
        chunks = chunks[:-1]
        length = sum(len(chunk) - 16 for chunk in chunks)
    unsigned = {'v': 1, 'stream_id': stream_id, 'size': length, 'chunk_size': 65536,
                'count': len(chunks), 'final_index': len(chunks) - 1,
                'chunk_ids': [digest(chunk) for chunk in chunks],
                'chunk_sizes': list(map(len, chunks)), 'aead': 'stream-aes256gcm-v1',
                'sender': sender['id']}
    manifest = dict(unsigned, sig=sender['sign'].sign(b'openmesh-manifest-v1' + digest(cbor(unsigned))))
    descriptor = {'file_id': digest(cbor(manifest)), 'file_key': key,
                  'name': 'vector.bin', 'media_type': 'application/octet-stream'}
    return data, chunks, manifest, descriptor


def main():
    alice, bob, carol = actor('alice', 1), actor('bob', 4), actor('carol', 7)
    vectors = []
    negatives = []
    for index, profile in enumerate(['small', 'fountain']):
        body = {'text': 'Independent Python OpenMesh vector'}
        wire, reference, raw = envelope(alice, [bob, carol], body, 0, profile, 20 + index * 10)
        vectors.append({'id': profile, 'kind': 0, 'sender': 'alice', 'recipient': 'bob',
                        'wire_hex': wire.hex(), 'body_hex': raw.hex(), 'reference_hex': reference.hex()})
        receipt_body = {'box_id': reference, 'device': bob['id'], 'status': 0, 'received_coarse': NOW}
        receipt, _, receipt_raw = envelope(bob, [alice], receipt_body, 2, 'small', 200 + index * 5)
        vectors.append({'id': profile + '-receipt', 'kind': 2, 'sender': 'bob', 'recipient': 'alice',
                        'original_id': profile, 'wire_hex': receipt.hex(), 'body_hex': receipt_raw.hex()})
    wire, reference, raw = envelope(alice, [bob], {'text': 'valid padded DEFLATE'}, 0, 'fountain', 220, padding_blocks=210000)
    vectors.append({'id': 'fountain-stretched-deflate', 'kind': 0, 'sender': 'alice', 'recipient': 'bob',
                    'wire_hex': wire.hex(), 'body_hex': raw.hex(), 'reference_hex': reference.hex()})
    for index, length in enumerate([0, 65521]):
        data, chunks, manifest, descriptor = file_stream(alice, length)
        wire, reference, raw = envelope(alice, [bob], {'attachments': [descriptor]}, 1, 'chunked', 40 + index * 10, manifest)
        if length == 0:
            bad_wire, _, _ = envelope(alice, [bob], {'attachments': [descriptor]}, 1, 'chunked', 130, manifest, corruption='attachments')
            negatives.append({'id': 'attachments', 'sender': 'alice', 'recipient': 'bob', 'wire_hex': bad_wire.hex()})
        identifier = 'chunked-' + str(length)
        vectors.append({'id': identifier, 'kind': 1, 'sender': 'alice', 'recipient': 'bob',
                        'wire_hex': wire.hex(), 'body_hex': raw.hex(), 'reference_hex': reference.hex(),
                        'manifest_hex': (b'\x01' + cbor(manifest)).hex(),
                        'chunks_hex': [chunk.hex() for chunk in chunks], 'file_hex': data.hex()})
        body = {'box_id': reference, 'device': bob['id'], 'status': 0,
                'received_coarse': NOW, 'manifest_hash': digest(cbor(manifest))}
        receipt, _, raw_receipt = envelope(bob, [alice], body, 2, 'small', 60 + index * 10)
        vectors.append({'id': identifier + '-receipt', 'kind': 2, 'sender': 'bob', 'recipient': 'alice',
                        'original_id': identifier, 'wire_hex': receipt.hex(), 'body_hex': raw_receipt.hex()})
    for case_index, corruption in enumerate(['kind', 'body', 'certificate', 'recipients', 'padding', 'decompression-bound']):
        wire, _, _ = envelope(alice, [bob, carol], {'text': 'Independent Python OpenMesh vector'}, 0, 'small', 140 + case_index * 5, corruption=corruption)
        negatives.append({'id': corruption, 'sender': 'alice', 'recipient': 'bob', 'wire_hex': wire.hex()})
    negative_files = []
    for case_index, corruption in enumerate(['wrong-final', 'reordered', 'truncated']):
        _, chunks, manifest, descriptor = file_stream(alice, 65521, corruption=corruption)
        wire, _, _ = envelope(alice, [bob], {'attachments': [descriptor]}, 1, 'chunked', 180 + case_index * 5, manifest)
        negative_files.append({'id': corruption, 'wire_hex': wire.hex(),
                               'manifest_hex': (b'\x01' + cbor(manifest)).hex(),
                               'chunks_hex': [chunk.hex() for chunk in chunks]})
    output = {'v': 1, 'generator': 'Python cryptography 50.0.2, stdlib CBOR/hmac/hashlib/zlib',
              'now': NOW, 'actors': [{'name': a['name'], 'seeds_hex': [s.hex() for s in a['seeds']],
                                     'root_hex': a['root'].hex(), 'certificate_hex': a['certificate'].hex()}
                                    for a in [alice, bob, carol]], 'vectors': vectors, 'negative_vectors': negatives, 'negative_file_vectors': negative_files}
    path = ROOT / 'packages/test-vectors/envelopes.json'
    expected = json.dumps(output, indent=2) + '\n'
    if '--check' in sys.argv:
        if path.read_text() != expected:
            raise ValueError('Independent vector regeneration differs')
    else:
        path.write_text(expected)
    print(json.dumps({'vectors': len(vectors), 'negative_vectors': len(negatives), 'negative_file_vectors': len(negative_files), 'bytes': path.stat().st_size,
                      'sha256': digest(path.read_bytes()).hex()}))


if __name__ == '__main__':
    main()
