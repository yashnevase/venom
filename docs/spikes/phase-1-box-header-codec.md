# Phase 1 Box header codec — 2026-11-15

## Task, phase and base

Implement the schema validation and deterministic-CBOR encoding for a Box header
from docs/04. Base commit is 66a5608 on `phase-1/protocol-core`.

## Implementation

`packages/core/src/box-header.ts` exports encode/decode functions for v1 headers.
It validates the version, field set, 16-byte box ID and tag, profile, unsigned
size/time values, optional docs/11 chunk sizes and optional 32-byte manifest
hash. All CBOR limits come from the caller. Byte fields are copied. A valid
unknown version returns `unsupported-version` for the caller to ignore.

`decodeBoxHeaderPrefix` parses the deterministic-CBOR header at the start of the
docs/04 `Header || SealedPayload` concatenation and returns the consumed length.
It leaves the opaque payload bytes untouched. It does not define the payload
format or signed transcript, encrypt or open a Box, or infer the unit of
`created_coarse`. Those decisions remain in the reviewed Box integration.

## Tests and vectors

The nine Box-header acceptance tests cover small, chunked and fountain profiles,
byte ownership, documented chunk sizes, malformed fields, resource limits,
unknown-version behavior and a 32 KiB opaque payload suffix. The initial tests
failed while the module/API was absent, then passed after implementation.

`packages/test-vectors/box-headers.json` has three canonical vectors. The
independent Python RFC 8949 encoder verified all three. Existing CBOR, identity,
HPKE, chunks, tags and deflate suites also pass. The full strict typecheck and
lint pass for this component.

## Real-device status

No phone run was needed for this deterministic parser. Complete Box encoding,
sealing, opening and receipts remain unverified on phones. D-8's external
cryptographer review remains outstanding.

## Claims and known problems

Claims-ledger rows P1-BOX-HEADER and P1-BOX-VECTORS record the checked behavior.
The prefix parser uses CBOR's self-delimited first-item boundary from docs/04.
It does not validate or decrypt payload bytes and must not be treated as a full
Box parser. Do not add sealing until the wire freeze and review gate pass.

## Files changed

- `packages/core/src/box-header.ts`
- `packages/core/src/cbor.ts`
- `packages/core/src/index.ts`
- `packages/core/box-header.test.ts`
- `packages/core/README.md`
- `packages/test-vectors/box-headers.json`
- `packages/test-vectors/README.md`
- `tools/verify-vectors.py`
- `docs/adr/008-box-envelope-review.md`
- `docs/claims-ledger.md`
- `docs/test-matrix.md`
- this report
