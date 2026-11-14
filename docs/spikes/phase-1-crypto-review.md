# Phase 1 crypto review preparation — 2026-11-15

## Task, phase and commit

Continue Phase 1 under the owner's existing encryption review gate. The task
was interpreted as preparing reviewable decisions and measuring native API
capabilities. Base commit is f35354f on phase-1/protocol-core. The implementation
commit and remote CI result are provided in the final handoff.

## Deliverables

ADR 002 now contains explicit recommendations and an approval record for native
crypto availability, content-key wrapping, streaming, recovery, compression,
size accounting and wire schemas. References are primary specifications.

The capability tool runs six native operations with ephemeral in-memory test
keys. It outputs measurement metadata and check results, with a typed failure
row for each failing exercise. It uses the current Node runtime and built-ins.

## Tests run

P1-CAP was written before the tool. Its first run failed because the module was
missing. Both tests then passed after implementation, including the simulated
missing-WebCrypto case. Static checking found the generic generateKey return
union. Runtime assertions now narrow each asymmetric key pair, and strict types
and typed lint pass.

Final local checks passed with 1 foundation acceptance test, 9 Vitest tests and
3 browser tests, 13 tests total. The independent verifier passed 8 Tag vectors.
The existing 256 Node HMAC comparison cases also pass within the Tag tests.
The dependency audit reported 0 advisories across 165 locked dependencies.
The installed-license check inspected 135 package versions. Dependencies are
the locked toolchain documented in ADR 001.

## Measured

Raw output is in crypto-capabilities-2026-11-15.json. The host is Mac arm64,
Node v24.11.0. Each number is one exercise duration including setup and checks.

| Algorithm | Exercise duration ms | Observed checks |
|---|---|---|
| Ed25519 | 1.477 | sign/verify, changed message rejected, private export rejected |
| X25519 | 0.577 | 32-byte agreement symmetry, non-extractable private keys |
| HKDF-SHA256 | 0.297 | RFC 5869 A.1 output match |
| AES-256-GCM | 0.437 | native round trip, 16-byte tag, changed ciphertext rejected |
| HMAC-SHA256 | 0.498 | Node HMAC API output match |
| SHA-256 | 0.116 | Node hash API output match |

These single-run timings describe the recorded exercises. Protocol throughput,
mobile performance and cross-implementation conformance need separate tests.

## Not verified on a real device

The capability tool ran in Node. Browser and phone crypto availability,
compression cost, recovery, sealed messages, streaming, storage and camera
behaviour need verification. The offline-hotspot test is pending by the owner's
explicit decision from the previous task.

## Claims ledger rows added or changed

P1-CAP records 6 passing native algorithm exercises and 2 acceptance tests on
the pinned Node runtime. The scope is local native capability availability.

## Known problems and owner choices

Phase 1's full gate awaits owner decisions on the exact wire format and the
D-8 cryptographer review required by docs/04 section 10. HPKE implementation
selection must resolve AGENTS.md's crypto-library restriction. Recovery still
needs a root-key mapping and a decision about any additional KDF algorithms.
Compression and complete-envelope size limits need target-device measurements.

The proposed decisions are recorded for review. The capability tool belongs to
development tooling and creates ephemeral native test operations. Production
identity and sealing APIs await the review decisions.

## Files changed

- docs/adr/002-phase-1-envelope-decisions.md
- docs/claims-ledger.md
- docs/spikes/crypto-capabilities-2026-11-15.json
- docs/spikes/phase-1-crypto-review.md
- tools/README.md
- tools/crypto-capabilities.test.ts
- tools/crypto-capabilities.ts
