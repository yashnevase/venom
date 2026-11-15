# Protocol core

Phase 1 currently contains Tag, deterministic CBOR, a delimited Box header
codec, chunk-integrity and local identity modules, plus the RFC 9180 HPKE Base
adapter. The owner's 2026-11-15 approval is recorded in ADR 002. Bounded
deflate is selected for v1 in ADR 006.
The full seal/open, receipt and chunked-profile acceptance gate remains pending.
Streaming encryption requires the external review specified by D-8.

## Tag API

```ts
import { deriveTag, deriveTagWindow } from '@openmesh/core';

const result = await deriveTag(tagKey, 0n);
if (result.ok) {
  // result.value is the 16-byte tag.
}
const window = await deriveTagWindow(tagKey, 0n);
```

`tagKey` is a 32-byte Uint8Array supplied by the caller. The counter is an
unsigned 64-bit bigint encoded big-endian. Both interpretations are recorded in
ADR 002 pending protocol freeze. The caller maintains per-direction secrets and
counters. `deriveTagWindow` returns 64 tags. Counter exhaustion returns a typed
error. A resync beacon awaits D-6.

## CBOR API

```ts
import { encodeCbor, decodeCbor, decodeCborPrefix } from '@openmesh/core';

const limits = { maxBytes: 16384, maxDepth: 16, maxItems: 4096 };
const encoded = encodeCbor(new Map([['v', 1]]), limits);
if (encoded.ok) {
  const decoded = decodeCbor(encoded.value, limits);
}
const prefix = decodeCborPrefix(boxBytesFromCarrier, limits);
```

Each caller supplies all three limits for its record/profile. The example uses
the acceptance-test conditions. maxBytes includes the complete CBOR item,
maxDepth counts container levels with the root container at level 1, and maxItems
counts every value, container and map key. decodeCborPrefix applies maxBytes to
the first item only. Each function returns CborResult.

The value subset is integers in CBOR's 64-bit ranges, bytes, well-formed text,
arrays, Maps, booleans and null. Encoding also accepts plain data objects and
converts their properties to map entries. Decoding returns Maps for CBOR maps.
Accessor properties, cycles, lossy strings, unsafe Number integers, negative
zero, floats, semantic tags and exotic JavaScript objects return typed errors.

The codec uses RFC 8949 section 4.2.1 bytewise map-key ordering. Decoding checks
strict lengths/integers, UTF-8, duplicate keys, depth and item budgets, then checks
canonical bytes by re-encoding. Record schemas and version handling belong to
their protocol parsers. decodeCborPrefix validates one bounded canonical item
and reports its consumed length, leaving the remaining bytes untouched. The
dependency and value-subset decision is in ADR 003.

## Box header API

```ts
import { decodeBoxHeader, decodeBoxHeaderPrefix, encodeBoxHeader } from '@openmesh/core';

const limits = { maxBytes: 16384, maxDepth: 4, maxItems: 32 };
const encoded = encodeBoxHeader({
  v: 1, box_id: new Uint8Array(16), profile: 'small', tag: new Uint8Array(16),
  size: 1024n, created_coarse: 20000n,
}, limits);
if (encoded.ok) {
  const decoded = decodeBoxHeader(encoded.value, limits);
  const prefix = decodeBoxHeaderPrefix(boxBytesFromCarrier, limits);
}
```

This codec encodes one deterministic-CBOR header item. decodeBoxHeaderPrefix
reads that self-delimited item at the start of `Header || SealedPayload` and
reports the boundary offset without decoding or copying the remaining payload.
It requires the docs/04 fields and 16-byte box ID/tag, accepts the
small, chunked and fountain profiles, validates optional chunk sizes against
docs/11's 64 KiB, 256 KiB and 1 MiB values, validates 32-byte manifest hashes,
preserves unsigned values as bigint, and returns
`unsupported-version` for a valid future version. Malformed fields and unknown
keys return `invalid-header`. The caller supplies CBOR byte, depth and item
budgets. Byte fields are owned copies.

This module does not encrypt or open payloads, define the signed transcript, or
assign a unit to `created_coarse`. Those decisions remain part of the reviewed
Box integration. Golden vectors are in
`packages/test-vectors/box-headers.json`.

## Chunk API

```ts
import { chunkSizeForFile, identifyChunk, verifyChunk } from '@openmesh/core';

const selection = chunkSizeForFile(fileSize);
const identified = await identifyChunk(ciphertextBytes, maxEncodedChunkBytes);
const verified = await verifyChunk(receivedBytes, expectedChunkId, maxEncodedChunkBytes);
if (verified.ok) {
  // Use verified.value, the owned snapshot that passed the hash check.
}
```

The caller supplies the example's fileSize and chunk buffers. The file-size
selector accepts a nonnegative safe-integer Number or uint64 bigint. It applies
docs/11's inclusive boundaries, choosing 64 KiB up to 64 MiB, 256 KiB above
64 MiB through 16 GiB, and 1 MiB above that. These targets live in config.ts.

identifyChunk snapshots one byte buffer and computes its 32-byte SHA-256
chunkId with WebCrypto. It returns the bytes and their ID together. verifyChunk
compares against the caller's expected ID and returns the checked owned bytes.
The expected ID must come from the authenticated manifest at the expected
position. Both the source bytes and expected ID are copied before asynchronous
hashing, isolating the check from later caller-buffer mutations.

maxEncodedChunkBytes is an explicit nonnegative safe-integer limit, checked
before copying and hashing. A zero limit admits an empty hashing fixture.
The encrypted representation's overhead and manifest authentication await the
reviewed profile. The size selector reports the published chunk target. The
encoded byte cap is supplied separately by the caller.

The chunk helpers return ChunkResult. Sequence completeness, manifest signatures
and AEAD finality await their reviewed protocol definitions.

## Identity API

```ts
import { createIdentityKeys, issueDeviceCertificate, verifyDeviceCertificate } from '@openmesh/core';

const identity = await createIdentityKeys();
if (identity.ok) {
  const limits = { maxBytes: 1024, maxDepth: 4, maxItems: 32 };
  const created = BigInt(Math.floor(Date.now() / 1000));
  const certificate = await issueDeviceCertificate(identity.value, { created, limits });
  if (certificate.ok) {
    const checked = await verifyDeviceCertificate(certificate.value,
      identity.value.root.publicBytes, { now: created, limits });
  }
}
```

createIdentityKeys generates independent root Ed25519, device Ed25519 and device
X25519 key material with WebCrypto. It also accepts three exact 32-byte seeds
named root, deviceSigning and deviceEncryption. Returned private CryptoKeys are
non-extractable. exportSeeds returns copies of the raw secrets in memory for the
future encrypted-backup integration. The caller must encrypt those secrets
before persistence. Recovery-word and encrypted-backup formats remain pending.

Public-byte access returns copies. Native RFC 8410 imports and a transient JWK
export derive public keys from supplied seeds. The API performs zero disk writes.
Unavailable native primitives return unsupported-crypto.

ADR 004 specifies the signed certificate and revocation records. The expected
root comes from the caller's trusted contact/invite. The example verifies against
its locally generated root. Remote certification needs the expected remote root.
Integer times are Unix seconds, with creation inclusive and expiry exclusive.
Callers supply current time and codec budgets. The example budgets are test
conditions. Unknown record versions return unsupported-version for callers to
ignore. Other malformed, over-budget, unauthenticated or time-invalid records
return IdentityResult failures.

revokeDeviceCertificate creates a root-signed revocation of an exact certificate.
verifyCertificateRevocation authenticates that record. Pass its encoded bytes as
policy.revocation to verifyDeviceCertificate to reject a matching credential
whose revocation time has arrived. The caller supplies known revocation evidence.
This module performs zero discovery or synchronization. Renewed certificates
need their own revocations under this policy.

## HPKE Base API

```ts
import { sealHpkeBase, openHpkeBase } from '@openmesh/core';

const context = {
  info: new Uint8Array(), aad: new Uint8Array(),
  limits: { maxPlaintextBytes: 32, maxContextBytes: 64 },
};
const wrapped = await sealHpkeBase(recipient.publicBytes, contentKey, context);
if (wrapped.ok) {
  const opened = await openHpkeBase(recipient, wrapped.value.enc,
    wrapped.value.ciphertext, context);
}
```

The caller supplies recipient from createIdentityKeys().deviceEncryption and
contentKey as bytes. The empty context and 32/64-byte budgets above are component
fixture conditions. OpenMesh application binding must be specified before full
Box integration. For the application-facing wrapping API, RFC 9180 section 8.1
recommends a single auxiliary-information path. ADR 005 requires application
binding in info with empty aad. The low-level adapter retains both inputs from
the RFC section 6.1 template for vector interoperability.

sealHpkeBase and openHpkeBase implement the fixed Base suite 0x0020/0x0001/0x0002
using native X25519, HKDF-SHA256, HMAC-SHA256 and AES-256-GCM. Each seal generates
a fresh ephemeral key and performs one sequence-zero encryption. Encapsulation
is 32 bytes and ciphertext adds a 16-byte tag. A 32-byte content key produces
80 bytes across these outputs. Versioned envelope serialization is a separate
integration step.

The caller supplies maxPlaintextBytes and maxContextBytes. The latter bounds the
combined info+aad bytes. Input lengths are checked before copying each buffer and
starting crypto. The implementation captures byte snapshots and local key
references before asynchronous work. The recipient pair must have matching
X25519 private and public keys. Missing native primitives and invalid input,
key, budget or authentication conditions return HpkeResult failures.

RFC fixtures, hostile-input tests and component measurements are recorded in
docs/spikes/phase-1-hpke.md. D-8's streaming review and full Box acceptance remain
pending.

## Deflate candidate API

```ts
import { compressDeflate, decompressDeflate } from '@openmesh/core';

const limits = { maxInputBytes: 16384, maxOutputBytes: 16384 };
const compressed = await compressDeflate(payload, limits);
if (compressed.ok) {
  const restored = await decompressDeflate(compressed.value, limits);
}
```

The caller supplies payload bytes and both limits. The 16 KiB values above are
example conditions. ADR 006 selects this bounded deflate candidate for v1. The
complete Box pipeline remains pending. This module implements the deflate candidate already named in
docs/04, using RFC 1950 zlib framing. The wire envelope and its compression marker
are separate integration work. Compressed bytes can vary by implementation.

compressDeflate uses native CompressionStream. Missing native compression returns
unsupported-compression. decompressDeflate uses pako 3.0.3's public low-level
inflate API with caller-owned output buffers. ADR 006 records the dependency,
size, license, source inspection and audit-status limits. The decoder runs
synchronously and returns a Promise containing CompressionResult. It performs
zero scheduling or background work.

Both input and output limits are nonnegative safe integers. Input length is
checked before copying. A native compressor failure or a malformed stream
returns a typed error. The decoder requires a complete zlib stream, a valid
checksum and zero trailing bytes. Unsupported dictionaries, gzip, raw deflate
and concatenated streams return invalid-data. An output-budget crossing returns
limit-exceeded with zero partial output bytes.

The decoder supplies at most 16 KiB of output space per call, with one extra
byte beyond the remaining allowance to detect an overflow. The workspace test
rejects an 8 MiB expansion after 16385 produced bytes under a 16384-byte allowance.
State is ended in a finally block. Successful output assembly retains at most
twice the output allowance plus one decoder block, alongside the input snapshot
and fixed decoder workspace. Compression and decoder memory on phones need
measurements. The component API operates on bounded buffers. Large-file streaming
integration is a later acceptance requirement.

Results and the native-stream investigation are in docs/spikes/phase-1-deflate.md.

## Verification

```sh
pnpm --filter @openmesh/core build
pnpm exec vitest run packages/core/tag.test.ts
pnpm exec vitest run packages/core/cbor.test.ts
pnpm exec vitest run packages/core/chunk.test.ts
pnpm exec vitest run packages/core/identity.test.ts
pnpm exec vitest run packages/core/hpke.test.ts
pnpm exec vitest run packages/core/compression.test.ts
pnpm test:vectors
```

Measurements and device coverage are in `docs/spikes/phase-1-tags.md` and
`docs/spikes/phase-1-cbor.md`, `docs/spikes/phase-1-chunks.md` and
`docs/spikes/phase-1-identity.md`, `docs/spikes/phase-1-hpke.md` and
`docs/spikes/phase-1-deflate.md`. Public
claims are tracked in `docs/claims-ledger.md`.
