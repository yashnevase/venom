// Draft-review evidence. Public fixtures exercise the literal docs/04 transcript.
import { readFile, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { createIdentityKeys, encodeCbor, compressDeflate, sealHpkeBase } from '../../packages/core/dist/index.js';

const unwrap = (result) => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
const limits = { maxBytes: 16384, maxDepth: 8, maxItems: 64 };
const encode = (value) => unwrap(encodeCbor(value, limits));
const bytes = (hex) => new Uint8Array(Buffer.from(hex, 'hex'));
const fixture = JSON.parse(await readFile(new URL('../../packages/test-vectors/identity.json', import.meta.url), 'utf8'));
const keys = unwrap(await createIdentityKeys({ root: bytes(fixture.root_seed_hex),
  deviceSigning: bytes(fixture.device_signing_seed_hex), deviceEncryption: bytes(fixture.device_encryption_seed_hex) }));
const certificate = bytes(fixture.certificate_hex);
const header = { v: 1, box_id: new Uint8Array(16).fill(49), profile: 'small',
  tag: new Uint8Array(16).fill(68), size: 1024, created_coarse: 1699920000 };

async function literalTranscript(payload) {
  const encodedHeader = encode(header);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encode(payload.body)));
  const transcript = new Uint8Array(encodedHeader.length + digest.length);
  transcript.set(encodedHeader);
  transcript.set(digest, encodedHeader.length);
  return transcript;
}

const original = { sender_device_cert: certificate, kind: 'msg', body: new Uint8Array([1, 2, 3]) };
const transcript = await literalTranscript(original);
const signature = new Uint8Array(await globalThis.crypto.subtle.sign('Ed25519', keys.deviceSigning.privateKey, transcript));
const coverage = [];
for (const [field, changed] of [
  ['kind', { ...original, kind: 'receipt' }],
  ['attachments', { ...original, attachments: ['changed-fixture'] }],
]) {
  const candidate = await literalTranscript(changed);
  const changedPayload = encode({ ...changed, sender_sig: signature });
  const originalPayload = encode({ ...original, sender_sig: signature });
  coverage.push({ field, payload_bytes_changed: Buffer.compare(changedPayload, originalPayload) !== 0,
    transcript_bytes_changed: Buffer.compare(candidate, transcript) !== 0,
    literal_signature_verifies: await globalThis.crypto.subtle.verify('Ed25519',
      keys.deviceSigning.publicKey, signature, candidate) });
}

let state = 0x42580001;
const source = Uint8Array.from({ length: 1400 }, () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state >>> 24;
});
let sizing;
for (let length = 600; length <= 1300; length += 1) {
  const payload = { sender_device_cert: certificate, kind: 'msg', body: source.subarray(0, length) };
  const actual = new Uint8Array(await globalThis.crypto.subtle.sign('Ed25519', keys.deviceSigning.privateKey,
    await literalTranscript(payload)));
  const placeholder = encode({ ...payload, sender_sig: new Uint8Array(64) });
  const signed = encode({ ...payload, sender_sig: actual });
  const compressionLimits = { maxInputBytes: 16384, maxOutputBytes: 16384 };
  const placeholderBytes = unwrap(await compressDeflate(placeholder, compressionLimits)).length;
  const signedBytes = unwrap(await compressDeflate(signed, compressionLimits)).length;
  if (placeholderBytes <= 1024 && signedBytes > 1024) {
    sizing = { body_bytes: length, placeholder_encoded_bytes: placeholder.length,
      signed_encoded_bytes: signed.length, placeholder_compressed_bytes: placeholderBytes,
      signed_compressed_bytes: signedBytes, assumed_bucket_bytes: 1024 };
    break;
  }
}
if (!sizing) throw new Error('Expected boundary counterexample');

const contentKey = new Uint8Array(32).fill(42);
const nonce = new Uint8Array(12).fill(43);
const aes = await globalThis.crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
const ciphertext = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 },
  aes, new Uint8Array(16384));
const wrapped = unwrap(await sealHpkeBase(keys.deviceEncryption.publicBytes, contentKey,
  { info: new Uint8Array(), aad: new Uint8Array(), limits: { maxPlaintextBytes: 32, maxContextBytes: 0 } }));
const componentMinimum = encode(header).length + nonce.length + ciphertext.byteLength
  + wrapped.enc.length + wrapped.ciphertext.length;
const report = { test: 'BOX-DRAFT-REVIEW', measured_at: new Date().toISOString(), node: process.version,
  platform: process.platform, arch: process.arch, fixture: 'packages/test-vectors/identity.json',
  interpretation: 'CBOR(header) concatenated with SHA-256(CBOR(body)), as a literal reading of docs/04',
  coverage, compression_boundary: sizing, frame_accounting: { frame_target_bytes: 16384,
    padded_plaintext_bytes: 16384, gcm_ciphertext_bytes: ciphertext.byteLength,
    nonce_bytes: nonce.length, recipient_wrap_bytes: wrapped.enc.length + wrapped.ciphertext.length,
    fixture_header_bytes: encode(header).length, minimum_component_bytes: componentMinimum,
    envelope_framing_bytes: 'unspecified and excluded' } };
await writeFile(new URL('../../docs/spikes/phase-1-box-draft-review.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
