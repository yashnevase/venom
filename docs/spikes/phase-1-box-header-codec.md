# Phase 1 Box header codec — 2026-11-15

## Task, phase and base

Implement the schema validation and deterministic-CBOR encoding for a separately
delimited Box header from docs/04. Base commit is 66a5608 on
`phase-1/protocol-core`.

## Implementation

`packages/core/src/box-header.ts` exports encode/decode functions for v1 headers.
It validates the version, field set, 16-byte box ID and tag, profile, unsigned
size/time values, optional positive chunk size and optional 32-byte manifest
hash. All CBOR limits come from the caller. Byte fields are copied. A valid
unknown version returns `unsupported-version` for the caller to ignore.

The codec consumes only a CBOR header item whose boundary is already known. It
does not split `Header || SealedPayload`, define the payload format or signed
transcript, encrypt or open a Box, or infer the unit of `created_coarse`. These
decisions remain in the reviewed Box integration.

## Tests and vectors

The seven Box-header acceptance tests were written before implementation. The
first run failed because the module was missing. All six then passed. Coverage
includes small, chunked and fountain profiles, byte ownership, documented chunk
sizes, malformed fields, resource limits and unknown-version behavior.

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
The header/payload boundary is not specified, so this API must not be treated as
a full Box parser. Do not add sealing until the wire freeze and review gate pass.

## Files changed

- `packages/core/src/box-header.ts`
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
