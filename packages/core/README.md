# Protocol core

Phase 1 currently contains Tag and deterministic CBOR modules. Encryption,
identity, receipts and chunked profiles await the decisions in
`docs/adr/002-phase-1-envelope-decisions.md`.
The owner explicitly kept encryption gated for review on 2026-11-14.

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

## Verification

```sh
pnpm --filter @openmesh/core build
pnpm exec vitest run packages/core/tag.test.ts
pnpm exec vitest run packages/core/cbor.test.ts
pnpm test:vectors
```

Measurements and device coverage are in `docs/spikes/phase-1-tags.md` and
`docs/spikes/phase-1-cbor.md`. Public
claims are tracked in `docs/claims-ledger.md`.
