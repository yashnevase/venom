# Phase 1 HPKE component report — 2026-11-15

## Task, phase and commit

Implement RFC 9180 Base single-shot encryption as the Phase 1 content-key-wrapping
component. Base commit is 692eac4 on phase-1/protocol-core. The implementation
commit and remote CI result accompany the handoff.

## Implementation and decisions

ADR 005 records the fixed suite 0x0020/0x0001/0x0002 and its mapping to native
X25519, HKDF-SHA256, HMAC-SHA256 and AES-256-GCM. Each seal generates one fresh
ephemeral key pair and uses sequence zero. The context stays inside the operation.
The caller supplies both size budgets. Native crypto performs the primitives.
The core imports zero Node modules and performs zero I/O.

The low-level adapter exposes info and aad from RFC 9180 section 6.1's template
for published-vector interoperability. Section 8.1 recommends one auxiliary
information path for application-facing single-shot APIs. ADR 005 requires the
OpenMesh wrapping API to bind its application context in info with empty aad.
That exact context and the versioned envelope remain integration work.

This component adds zero package dependencies. The independent verifier uses
the existing Python, OpenSSL 3 and Node tools. OpenSSL 3's requirement is recorded
in ADR 004. Native providers share OpenSSL lineage, while the verifier implements
the key schedule independently and uses a separate cipher API. These checks
establish component conformance. External cryptographic review is outstanding.

## Tests run

The acceptance suite first failed for the missing module. After implementation,
all 8 HPKE tests pass. The public RFC vector reproduces the expected ciphertext
when the native ephemeral generation call is mocked with its public fixture key.
Production callers cannot supply a deterministic ephemeral key.

Tests include round trips at 0, 1, 32, 16384 and 5242880 bytes, fresh encapsulations,
incorrect recipients, changed info/AAD, truncation, all 384 ciphertext-bit changes
and all 256 encapsulation-bit changes in a 32-byte content-key fixture, byte
budgets before generation, detached input, short keys, invalid local key input,
the low-order X25519 values zero and one, an injected all-zero agreement output,
missing/unsupported WebCrypto, and mutations to all caller byte inputs during
asynchronous sealing/opening.

FUZZ-HPKE uses seed 0x48500001 for 2000 encapsulation/ciphertext pairs. Every
input returns a typed failure. A standalone run records the outcome counts below.
Python independently checks 8 key/context values and authenticates/decrypts the
published fixture with the derived key/nonce through Node's classic cipher API.
All 9 new vector checks pass, bringing the independent total to 67.

Local checks pass 1 foundation test, 43 Vitest tests and 3 browser regressions,
47 tests total. Strict types, builds, typed lint, 67 independent vector checks
and 136 installed dependency-license checks pass. The advisory audit reports
0 findings across 166 locked dependencies.

## Measured

Mac arm64, Node v24.11.0, no network. A 32-byte content key yields 32 encapsulation
bytes and 48 ciphertext bytes, 80 bytes before envelope metadata. Each operation
has 32 trials. Median is the mean of the central sorted samples. p95 is nearest
rank. Raw samples are in phase-1-hpke-measurements.json.

| Operation | Median ms | p95 ms |
|---|---|---|
| sealHpkeBase | 0.249 | 0.362 |
| openHpkeBase | 0.167 | 0.273 |

The compiled public ESM entry point is used by the benchmark and standalone fuzz
run. The 2000-input run took 42.917 ms, with a slowest opening call of 0.358 ms.
Results were 1788 invalid-key, 38 invalid-input, 165 authentication-failed and
9 limit-exceeded. Zero plaintext results were accepted. RSS sampled after each
call rose from 56803328 bytes to a maximum of 65486848 bytes. Those are process
observations under this bounded workload. Browser memory costs need measurements.

## Not verified on a real device

This HPKE module has run in Node on the Mac. Browser and phone execution,
cross-device key wrapping, complete Box exchanges, encrypted key persistence,
and offline-hotspot transfer remain unverified. Existing browser regressions
exercise the separate diagnostic harness. The offline-hotspot experiment is
pending at the owner's request.

## Claims ledger rows added or changed

VEC-HPKE and HPKE-ROUNDTRIP/AUTH/BOUNDS/LOW-ORDER/SNAPSHOT/CRYPTO record component
conformance and tested failure outcomes. FUZZ-HPKE records the hostile inputs.
HPKE-MEASURE records the measured costs and content-key output size.

## Known problems

Application context encoding, recipient-envelope schema, content encryption,
padding, compression, receipts and full small/chunked vectors remain pending.
D-8 requires external review before adopting the streaming construction. The
owner confirmed that review is unavailable. Full Phase 1 acceptance and the later
phase gates remain pending. Public safety claims require the separate Gate E.

## Files changed

- README.md
- docs/adr/002-phase-1-envelope-decisions.md
- docs/adr/005-native-hpke-base.md
- docs/claims-ledger.md
- docs/spikes/phase-1-hpke-measurements.json
- docs/spikes/phase-1-hpke.md
- packages/core/README.md
- packages/core/hpke.test.ts
- packages/core/src/hpke.ts
- packages/core/src/index.ts
- packages/test-vectors/README.md
- packages/test-vectors/hpke.json
- tools/verify-vectors.py
