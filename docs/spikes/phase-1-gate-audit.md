# Phase 1 development-gate audit

Experimental, not independently reviewed.

## Scope and verdict

Audit the Phase 1 Node protocol-core gate in docs/05 under the owner's amendment
in AGENTS.md. Local criteria pass on Node 24.11.0, Mac arm64. Recovery commit 51e129e passed
GitHub CI runs 43698351178 and 43698346187. Phase 2 development may proceed. This is the development gate. Public release,
security promises and Gate E require the outstanding external review.

## Requirements and authoritative evidence

| Requirement | Evidence inspected | Local result |
|---|---|---|
| Identity and separate signing/agreement keys | identity.ts, identity.test.ts, identity.json, Python/OpenSSL verifier | Certificate/root/revocation cases and seed separation pass. |
| Small Box seal/open | box.ts, box.test.ts, independent envelopes.json | Round trips, wrong keys/roots, expired/revoked sender, truncation and each flipped bit of a two-recipient fixture pass. |
| Chunked files and Manifest | box.ts, box-wire.ts, box.test.ts, independent file fixtures | 0 B,65,520 B,200,000 B,5 MiB and 16 seeded random cases through 5 MiB pass. Reorder/duplicates, incomplete/conflicting chunks, finality and output-failure retry are covered. |
| Fountain core payload | Complete fountain fixtures and large valid-DEFLATE fixture | Core envelope open passes. Camera/QR carrier remains Phase 5. |
| Tags and window edges | tag.test.ts and tags.json | Clock independence, gaps 0..63, excluded 64, uint64 exhaustion and 256 Node-HMAC comparisons pass. |
| Receipt validation | box.test.ts, receipt-race.test.ts and independent small/fountain/chunked Receipt fixtures | Expected signer/device, unknown reference, revocation, manifest omission/presence, complete-file eligibility and deterministic idempotency key pass. Durable application deduplication is Phase 2 storage work. |
| Recovery mapping | recovery.test.ts, published eight pairs and 72 independent root/public-key vectors | 24-word checksum encoding, owner's direct HKDF mapping, normalization bounds, owned snapshots, native failures and random device material pass. |
| ADR 008 semantic-field coverage | Independent rejection fixtures for kind/body/attachments/certificate/recipients, header bit changes and receipt tests | Changed signed semantics are rejected on tested fixtures. |
| ADR 008 acyclic size/construction order | docs/04 revision2, complete bucket tests, WIRE-SIZE-1 evidence, independent Python serialization and fresh review | Header size from lengths, signature outside compression, separate file stream/Manifest/control signature and complete 16 KiB cap are covered. |
| ADR 008 HPKE, padding and decompression | RFC HPKE component vectors, full-envelope fixtures, independent invalid-padding/bound cases, legal large-DEFLATE fixture | Context binding, full recipient-wrap AAD, bucket padding and declared-size/1 MiB output limits pass. |
| Whole-Box and Manifest fuzzing | box.test.ts, cbor.test.ts, bounded token preflight | 5000 seeded byte inputs per parser plus every-bit/truncation and collection-head cases return outcomes without escaping exceptions. Corpus scope is finite. |
| All vectors pass | tools/verify-vectors.py plus independent generator --check and TypeScript acceptance | 181 comparisons across all ten committed suites pass locally. |
| Strict types, lint, build, licenses | pnpm check | 132 unit tests, one foundation test, types/build/lint,139 installed package licenses and pinned MIT word-data checks pass. |
| No browser/network dependency in core | Imports from 13 TypeScript source files, package manifest and compiled entry | Imports are local modules, cborg and pako. No Node platform/upper-layer imports. Compiled entry loads in Node 24.11.0. |
| Self-review and independent review | ADR 011 checklist, ADRs 012/013 vectors, fresh envelope/recovery review records | Required development evidence recorded. These do not replace a cryptographer. |
| Experimental labels and claims | REVIEW-NOTICE tests, README, current diagnostic pages, build status files and ledger | Current label checks pass. Ledger entries describe test/arithmetic observations. |
| Per-phase branch and CI | phase-1/protocol-core; previous envelope CI 43696447987, final recovery CI in handoff | Recovery commit 51e129e passed both CI runs. |

## Reproduction

```sh
python3 -m venv /tmp/openmesh-vector-env
/tmp/openmesh-vector-env/bin/python -m pip install -r tools/vectors/requirements.txt
OPENMESH_VECTOR_PYTHON=/tmp/openmesh-vector-env/bin/python pnpm check
pnpm test:browser
pnpm audit --audit-level=low
```

Existing browser diagnostics passed 14 tests. They exercise earlier probes,
not a recovery or envelope app in a browser. npm audit returned zero findings.

## Device gaps and later gates

Complete envelopes, streamed-file core, Receipt and recovery have no real-phone
result. Phase 1 is the Node/no-UI phase and these modules perform no camera,
storage or carrier I/O. Phase 2 adds those integrations and must satisfy its
browser/device gate before progression. Existing Xiaomi compression and codec
observations remain separate. Offline-hotspot testing remains pending as the
owner requested. Gate A, retention, later phase acceptance and the external
release review remain outstanding. This audit completes no project-wide goal.
