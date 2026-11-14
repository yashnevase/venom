# Protocol core

Phase 1 currently contains Tag, deterministic CBOR, chunk-integrity and local
identity modules. The owner's 2026-11-15 approval is recorded in ADR 002.
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
import { encodeCbor, decodeCbor } from '@openmesh/core';

const limits = { maxBytes: 16384, maxDepth: 16, maxItems: 4096 };
const encoded = encodeCbor(new Map([['v', 1]]), limits);
if (encoded.ok) {
  const decoded = decodeCbor(encoded.value, limits);
}
```

Each caller supplies all three limits for its record/profile. The example uses
the acceptance-test conditions. maxBytes includes the complete CBOR item,
maxDepth counts container levels with the root container at level 1, and maxItems
counts every value, container and map key. Both functions return CborResult.

The value subset is integers in CBOR's 64-bit ranges, bytes, well-formed text,
arrays, Maps, booleans and null. Encoding also accepts plain data objects and
converts their properties to map entries. Decoding returns Maps for CBOR maps.
Accessor properties, cycles, lossy strings, unsafe Number integers, negative
zero, floats, semantic tags and exotic JavaScript objects return typed errors.

The codec uses RFC 8949 section 4.2.1 bytewise map-key ordering. Decoding checks
strict lengths/integers, UTF-8, duplicate keys, depth and item budgets, then checks
canonical bytes by re-encoding. Record schemas and version handling belong to
their protocol parsers. The dependency and value-subset decision is in ADR 003.

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

## Verification

```sh
pnpm --filter @openmesh/core build
pnpm exec vitest run packages/core/tag.test.ts
pnpm exec vitest run packages/core/cbor.test.ts
pnpm exec vitest run packages/core/chunk.test.ts
pnpm exec vitest run packages/core/identity.test.ts
pnpm test:vectors
```

Measurements and device coverage are in `docs/spikes/phase-1-tags.md` and
`docs/spikes/phase-1-cbor.md`, `docs/spikes/phase-1-chunks.md` and
`docs/spikes/phase-1-identity.md`. Public
claims are tracked in `docs/claims-ledger.md`.
