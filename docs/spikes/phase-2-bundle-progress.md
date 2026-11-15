# Phase 2 bundle integration progress

Experimental, not independently reviewed.

Task is the ADR015 bundle module. Base commit21f9a01. Initial tests failed with
missing bundle.js. Four framing tests now pass. The async-chunk regression failed before the
encoder accepted factories, then passed after implementation. Strict types pass. The module
remains uncommitted while full carrier/core integration is built.

No measurements, real-device results or claims-ledger rows were added. Record
framing is implemented, but core authentication/linkage, transaction rollback,
build wiring and complete acceptance coverage remain
pending. Files added are packages/engine/src/bundle.ts, bundle.test.ts, README.md
and this progress record. No public API completion or phase-gate claim is made.

Async chunk export now captures declared lengths and a fresh source factory,
snapshots bounded control/Manifest bytes at invocation, copies one chunk per
read, checks declared lengths/count and splits output to the chosen read size.
The array convenience path remains for already staged small fixtures. Core
verification and transactional publication remain the next integration step.

The core import coordinator is now implemented with injected transactional
ciphertext/plaintext staging. Its independent message test and bad-tail rollback
case pass after a missing-module failure. Targeted suite now has five passing
tests. File/Receipt integration, full failure coverage and package wiring remain
pending. Files also added are src/import.ts and import.test.ts.

The next integration step added the engine package/build entry and independent
file import/corruption rollback coverage. Six targeted tests pass. The importer
captures verification contacts and limits before reads. Receipt round-trip and
full completion coverage remain pending. No device result or phase-gate claim
is added by these Node tests.

Exact-size createBundleSource is now implemented after its missing-function
acceptance failure. The carrier export integration now uses FileCarrier and
createBlobWriter. The independent file import creates a Receipt checked against
the trusted original. An initial Receipt failure exposed mixed source/package
core imports in the test, giving separate module-local verified-handle registries.
Using the same public core package entry throughout resolves that integration
mismatch. Seven targeted tests, strict types and engine lint now pass. Full
repository checks, export-side core validation, expanded failure coverage and
module completion records remain pending before commit.

Export-side linkage checks are now in src/export.ts, following a missing-module
acceptance failure. The helper validates the Manifest hash and chunk-size link
before creating the source, and checks each staged ciphertext's size/hash during
streaming. Eight targeted tests pass, including changed Manifest/chunk rejection.
This checks export consistency, not sender authenticity, which remains import's
core verification responsibility. The first full check stopped at one lint issue;
that issue was corrected and a full rerun was started. Completion and CI evidence
are pending. No real-device result or new claims-ledger assertion is added.

Transaction tests now exercise ciphertext-staging, plaintext-write and commit
failures, with abort and no successful publication. A new pre-staging corruption
regression failed because changed ciphertext reached staging, then passed after
moving Manifest-link and chunk size/hash checks before stageChunk. Core openFile
still performs final signature/AEAD checks before commit. Eight targeted tests,
strict types and engine lint pass. Final full check is running. No device result
is implied. Whole-module completion still requires remaining ADR015 coverage,
documentation consolidation and remote CI.

Final module coverage now includes ten targeted tests. Empty and65,521-byte file
fixtures exercise import, Receipt creation/verification, corrupt ciphertext,
wrong recipient and staging/write/commit failures. A5 MiB framing case emits
reads of at most16 KiB and verifies async source closure on cancellation. A huge
CBOR length head fails before the payload read. These bounded Node observations
provide no browser, storage-adapter or phone evidence. README now documents the
public APIs, source stability, core module identity and transaction contracts.
