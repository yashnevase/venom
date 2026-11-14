# Phase 1 chunk-integrity report — 2026-11-15

## Task, phase and commit

Implement docs/09 T1's hashing and docs/11's chunk-size selection within Phase 1.
Base commit is 64056bf on phase-1/protocol-core. The implementation commit and
remote CI result are provided in the final handoff. Encryption remains gated by
the owner's earlier decision. The offline-hotspot test is pending at their request.

## Implementation and choices

chunkSizeForFile uses the existing 64 KiB / 256 KiB / 1 MiB table, with inclusive
upper bounds at 64 MiB and 16 GiB. Those constants live in config.ts. Sizes are
limited to uint64, matching the implemented CBOR integer domain, with safe
Number inputs also accepted. Selection is independent of whole-file allocation.

identifyChunk copies opaque bytes under a caller-supplied cap and computes
SHA-256 with WebCrypto. It returns the owned bytes and chunkId together.
verifyChunk snapshots the expected ID before asynchronous hashing, compares
against the computed ID, and returns the verified owned byte snapshot.
Callers supply the expected ID from an authenticated manifest and position.
The encoded-byte limit is explicit, with zero permitting an empty hashing fixture.
This preserves the distinction between published chunk targets and the encrypted
representation's overhead, which is part of the pending D-8 review.

The module uses the already prescribed technique and native primitive. Its
dependency set is the existing locked toolchain and cborg reviewed in ADR 003.

## Tests run

The acceptance test was written first and failed for the missing source module.
After implementation, all 8 chunk tests passed. They cover hash vectors, size
boundaries, invalid sizes and caps, invalid IDs and byte types, detached buffers,
caller mutation during hashing, wrong-position reference IDs, and unavailable
WebCrypto. Tests rejected all 512 single-bit changes in a 64-byte fixture and
all 256 single-bit changes in its expected hash. Truncation was also rejected.
128 deterministic payloads matched Node's SHA-256 API.

Python independently verifies 10 hash fixtures with hashlib and 9 size cases
from the docs/11 table. Together with existing fixtures this gives 53 vectors.
Final local checks include 1 foundation acceptance test, 25 Vitest tests and
3 browser regressions, 29 tests total. Strict types, builds, typed lint, the
independent verifier and 136 installed dependency-license checks pass.
The advisory audit reported 0 findings across 166 locked dependencies.

## Measured

Mac arm64, Node v24.11.0, one owned byte-buffer copy and native SHA-256 per trial,
32 trials for each size. Median is the mean of the two central sorted samples.
p95 is the nearest-rank 95th percentile. Setup allocation is outside the timed
operation. Raw measurements are in phase-1-chunk-measurements.json.

| Chunk bytes | Median ms | p95 ms |
|---|---|---|
| 65536 | 0.046 | 0.074 |
| 262144 | 0.125 | 0.159 |
| 1048576 | 0.403 | 0.446 |

The compiled public ESM entry point passed sizing, identification and verification
checks. These are local component observations. File-transfer performance and
mobile costs require separate measurements.

## Not verified on a real device

The chunk helpers ran in Node. Browser and phone execution, large-file storage,
offline-hotspot transfer and encrypted chunk interoperability need verification.
Sequence completeness, signed manifests, resume and AEAD finality belong to the
reviewed profile and later transfer integration.

## Claims ledger rows added or changed

VEC-CHUNK and CHUNK-SIZE/BOUND/CORRUPTION/POSITION/SNAPSHOT/PROPERTY/CRYPTO record
the local integrity and sizing tests. CHUNK-MEASURE records the per-chunk timings.

## Known problems

The expected hash's authenticity is supplied by the caller. Manifest signatures,
the encryption construction, complete-sequence checks and profile serialization
await review and implementation. The full Phase 1 gate is still pending.

## Files changed

- README.md
- docs/claims-ledger.md
- docs/spikes/phase-1-chunk-measurements.json
- docs/spikes/phase-1-chunks.md
- packages/core/README.md
- packages/core/chunk.test.ts
- packages/core/src/chunk.ts
- packages/core/src/config.ts
- packages/core/src/index.ts
- packages/test-vectors/README.md
- packages/test-vectors/chunks.json
- tools/verify-vectors.py
