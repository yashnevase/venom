# Phase 1 identity report — 2026-11-15

## Task, phase and commit

Implement local identity, root-signed device certificates and certificate-specific
revocation in Phase 1. Base commit is b0a08c3 on phase-1/protocol-core.
The implementation commit and remote CI result accompany the handoff.

## Implementation and decisions

ADR 004 records the delegated serialization choices. The factory uses native
Ed25519 and X25519 with three independent 32-byte seeds. RFC 8410 private-key
imports and a transient JWK export supply public components. Returned private
keys are non-extractable. The factory retains seeds in memory and returns copies
through exportSeeds for future encrypted backup. It performs zero disk writes.

Certificates use deterministic CBOR, Unix-second uint64 times and root signatures.
The expected root is supplied by the caller's trusted contact/invite. Optional
expiry is exclusive. The signed tombstone targets SHA-256 of the exact encoded
certificate. Renewed credentials require their own revocations. Verification
accepts caller-supplied revocation evidence and current time. Discovery and
synchronization remain engine work.

The owner approved the implementation direction and delegated continuation.
They also confirmed that no external cryptographer review is available. D-8
requires that evidence before adopting the streaming-encryption construction.
The full Phase 1 gate remains pending, so later phase gates remain pending.

## Tests run

The initial acceptance suite failed with the missing identity module, then passed
after implementation. All 10 identity tests pass. They cover exact independent
fixtures, non-extractable private keys, independent roles, copied seed/public
exports, seed restoration, creation and expiry boundaries, an incorrect root,
every single-bit change in the 197-byte certificate, effective revocation timing,
changed revocations, unknown versions, byte caps and missing WebCrypto.

Mutation tests change certificate, root, proof and byte-budget inputs immediately
after verification starts. The check retains its original snapshots. A fixed
0x49440001 seed generates 2000 hostile byte strings, each checked by both parsers
with typed failures and zero uncaught exceptions.

Python encodes the records independently and uses OpenSSL 3 for the three key
derivations and two deterministic signatures. All 5 new outputs agree, bringing
the independent vector total to 58. OpenSSL 3 is an existing test-tool requirement
recorded in ADR 004, with zero new core runtime dependencies.

Final local checks pass 1 foundation test, 35 Vitest tests and 3 browser
regressions, 39 tests total. Strict types, builds, typed lint, 58 independent
vector checks and 136 installed dependency-license checks pass. The advisory
audit reports 0 findings across 166 locked dependencies.

## Measured

Mac arm64, Node v24.11.0, 32 sequential trials per operation, no network.
The certificate fixture is 197 bytes and the revocation is 138 bytes.
Codec caps are 1024 bytes, 4 container levels and 32 values/map keys.
Median is the mean of the two central sorted samples. p95 uses nearest rank.
Raw samples are in phase-1-identity-measurements.json.

| Operation | Median ms | p95 ms |
|---|---|---|
| Create three key pairs | 0.216 | 0.415 |
| Issue certificate | 0.096 | 0.191 |
| Verify certificate | 0.101 | 0.193 |
| Reject effectively revoked certificate | 0.198 | 0.294 |

The benchmark imports the compiled public ESM entry point and checks every result.
These are component costs on this runtime and device.

## Not verified on a real device

Identity operations have run in Node on the Mac. Browser and phone crypto support,
encrypted persistent key storage, recovery words and cross-device restore still
need verification. The user's Xiaomi LAN diagnostic result remains recorded
separately. Offline-hotspot testing is pending at the user's request.

## Claims ledger rows added or changed

VEC-IDENTITY and IDENTITY-KEYS/TIME/TRUST/REVOKE/VERSION/RESTORE/SNAPSHOT/CRYPTO
record the local identity results. FUZZ-IDENTITY records hostile-input coverage.
IDENTITY-MEASURE records the timings. Full seal/open remains UNPROVEN.

## Known problems

External review for D-8 remains outstanding. Full small/chunked sealing,
receipts, authenticated manifests, phrase encoding and encrypted-backup integration
remain pending. Certificate checks require the correct expected root and known
revocation evidence from the caller. The tests establish local conformance.
Independent security review and real-device results remain separate requirements.

## Files changed

- README.md
- docs/adr/002-phase-1-envelope-decisions.md
- docs/adr/004-identity-certificates.md
- docs/claims-ledger.md
- docs/spikes/phase-1-identity-measurements.json
- docs/spikes/phase-1-identity.md
- packages/core/README.md
- packages/core/identity.test.ts
- packages/core/src/identity.ts
- packages/core/src/index.ts
- packages/test-vectors/README.md
- packages/test-vectors/identity.json
- tools/verify-vectors.py
