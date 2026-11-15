# Phase 1 experimental envelopes

Experimental, not independently reviewed.

## Task and construction

Implement docs/04 development revision 2 seal/open, streamed files, Manifest
validation and Receipts. Base commit f3b3931. The initial acceptance suite failed
with missing box.js before implementation. Its first implemented run had nine
failures, then corrections passed the tests. Additional review regressions for
receipt snapshots, collection limits and legal DEFLATE overhead were shown
failing before their corresponding fixes.

Core APIs reuse the existing identity, HPKE, CBOR, hash and deflate components.
File input/output uses awaited per-index callbacks and bounded chunk buffers.
Callers stage output until the operation succeeds, discard failed staging, and
apply Receipt idempotency keys atomically with delivery state. These adapters
perform no storage or network operation themselves.

## Local verification

Node 24.11.0 on Mac arm64. Full check includes foundations, strict types, builds,
lint, unit tests, independent vectors and 139 installed npm license checks.
The full local run passed 120 unit tests, 101 independent vector comparisons,
strict types, build, lint and 139 npm license checks. The final commit is in the
task handoff. Browser checks
exercise the existing fourteen diagnostic tests, separately from the new
Node envelope tests. npm advisory audit returned zero findings.

The independently generated fixture set contains nine positive fixtures and ten
rejection fixtures, with SHA-256
c1a374eec87e1c6f1d5e27cb936465fa4dbe9c1ecdbcb7082065ea770f7ec0c3.
Its 2931245 bytes are test data. It adds zero application bytes. The generator
uses Python cryptography 50.0.2 with standalone CBOR, hmac/hashlib and zlib.
Reproduce with tools/vectors/requirements.txt and envelope_vectors.py --check.
The legal large-DEFLATE fixture distinguishes encoded-input and output bounds.
Public fixture seeds must never become application identities.

File round trips cover 0, 65,520, 200,000 and 5,242,880 bytes. The corruption test flips
every bit of a valid two-recipient Box, including the other recipient's wrap.
Every-bit Manifest fixture changes are rejected. Five thousand bounded byte
inputs per parser exercise whole-Box and Manifest error handling. The unit suite
also checks exact bucket sizes, block-budget boundaries, missing/wrong chunks,
finality, output failure, retry, wrong keys, revocation and Receipt policy.
These are test observations, without a device-performance claim.

## Review and remaining work

The fresh-review record is phase-1-envelope-adversarial-review.md. An automatic
content filter interrupted the first reviewer's final report. A separate
implementation pass checked its corrections and the additional fixes. Self-review
status is in ADR 011. BIP-39 root recovery and its independent vectors remain a
Phase 1 task. Phase 2 waits for the complete Phase 1 gate.

No envelope, Receipt, identity, HPKE or streamed-file run was performed on a real
phone. Existing Xiaomi compression/codec measurements do not establish those
results. The no-internet hotspot experiment remains pending as requested.
External review gates public release, security promises and Gate E.

## Files changed

Core implementation and exports, envelope/Receipt/CBOR acceptance tests, public
vector fixtures and generator, pinned Python test-tool requirements and CI setup,
experimental build labels and diagnostic HTML, module/root/vector READMEs,
ADR008/011/012, claims ledger, test matrix and this spike/review evidence.
