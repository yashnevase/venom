# Phase 1 root recovery

Experimental, not independently reviewed.

## Task and evidence

Implement the owner's English BIP-39 24-word entropy/checksum encoding and direct
OpenMesh entropy-to-HKDF root mapping from docs/04. Base commit bacbf88.
Acceptance initially failed because the module was absent. The packaging test
then failed because its MIT notice was absent from dist/data. Both were fixed.

Eleven recovery tests pass on Mac arm64, Node 24.11.0. Eight published 256-bit
entropy/phrase examples match in both directions. The independent Python
implementation supplies 72 entropy/phrase/root-seed/Ed25519-public-key cases,
including those examples. The fixture file is 35069 bytes with SHA-256
50b7fabd9fc005643e68afcc4999986c1367c2d9320aa55ac9dc332ed90b015f.
Inputs are bounded and copied before native asynchronous operations. Tests also
cover invalid checksums/words/lengths, normalization expansion, native failures,
512-unit boundaries, public entry exports and independent random device seeds.

The wordlist is 13116 bytes, 2048 unique sorted words, 6246 gzip bytes. Its pinned
SHA-256 is 2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda.
The generated TypeScript wrapper is 13277 bytes, emitted JavaScript 13258 bytes.
The full 1084-byte MIT notice and provenance ship with the data. The existing
Python tooling generates fixtures, adding zero new executable dependencies.

## Fresh review

Agent /root/recovery_review started with no parent history and read the
specification, ADR 013, implementation and tests. It found missing package exports,
distributed MIT notice and acceptance assertions. The primary agent added these,
plus independent vectors and the module API README. The reviewer re-read the
corrections, ran 11 acceptance tests and reported no remaining recovery correctness
finding. The focused run was 109 ms on Node 24.11.0. It did not independently fetch
the upstream assets. Root staging fetched the pinned revision and records exact
hashes in data/bip39-provenance.json.

This review does not replace a cryptographer. External review gates public
release, security promises and Gate E. No browser, phone, recovery UI, storage or
backup-restore run is provided here. Those device/integration results remain
pending.

## Files changed

- packages/core/src/recovery.ts and src/index.ts
- packages/core/src/data/bip39-english.txt and generated bip39-english.ts
- packages/core/src/data/bip39-LICENSE.txt and bip39-provenance.json
- packages/core/recovery.test.ts and box.test.ts
- packages/core/package.json and README.md
- packages/test-vectors/bip39-published.json, recovery.json and README.md
- tools/vectors/recovery_vectors.py, stage-recovery-data.mjs,
  verify-vectors.py and check-licenses.mjs
- docs/adr/013-bip39-recovery-wordlist.md and ADR 008/011 completion records
- docs/claims-ledger.md, docs/test-matrix.md and phase-1-gate-audit.md
- this report
