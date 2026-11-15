# Phase 2 store progress

Experimental, not independently reviewed.

Initial browser test failed with missing store module, then passed in Chromium
for atomic multi-store writes, reopening and rejecting an oversized record.
Store implementation and its DOM-specific TypeScript project are uncommitted.
Adding global DOM declarations initially changed core BufferSource typechecking.
The store now uses a separate DOM project and the browser test consumes built
API declarations. Root typechecking and store compilation were rerun. No core
source was changed. Package/build wiring and full storage acceptance remain
pending. No real-phone test or new claims-ledger row is provided.

Files added are packages/store/src/index.ts, tsconfig.json and README.md,
tools/store.browser.test.ts and this report. Root tsconfig excludes the separate
store source project. Store build must be wired before clean CI can run its
browser acceptance test.

Workspace package and browser build staging are now wired. The store's emitted
module is copied into the existing diagnostic server tree by stage-store.mjs,
alongside the experimental status file. No new dependency is added. Two Chromium
acceptance tests pass for reopen, atomic multi-store writes, whole invalid-batch
rejection, owned byte snapshots, deletion and oversized-record rejection. Store
build, root types and targeted lint pass. The full repository check was started.
Upgrade/failure cases, quotas, store schema validation and phone execution remain
pending. New files also include package.json and tools/stage-store.mjs, and root
package build/lockfile now include the store workspace. Work remains uncommitted.

P2-STORE-SCHEMA initially failed because missing limit fields and an existing
empty schema were accepted. openCache now requires both explicit positive limits
and checks the exact expected store set, out-of-line keys, autoIncrement=false
and no indexes before resolving. The regression passes. P2-STORE-VERSION also
passes, confirming connection closure on versionchange and rejection of a newer
unsupported schema. Four Chromium store tests now pass. Root typecheck and
store/test lint pass. No phone, browser-quota or durable-backup result is added.
Work remains uncommitted pending quota and remaining failure integration.

The storage-capacity acceptance test failed with missing inspectStorage, then
passed after the advisory estimate/persistence APIs were added. The Settings
API reports estimated usage, quota, remaining space, 80% warning status and known
persistence status without prompting. Persistence requests are a separate API.
This warning interprets the docs/11 threshold against browser-reported quota,
not independently measured filesystem free space. Native quota reservations,
per-class accounting/eviction and quota-aware staging remain pending. Five
Chromium store tests pass. No phone or device-capacity claim is established.

The OPFS staging adapter is now started in src/opfs.ts. Its first acceptance
test failed before the API existed, then was rerun after implementation. It
stages indexed ciphertext/plaintext files in a per-import directory and exposes
commit/publication and abort/removal. Byte/count budgets precede writes. The
engine supplies verification and atomic visibility metadata. Full publication,
failure, cancellation, crash cleanup and quota testing remain pending. The
adapter is uncommitted. No phone or full-engine OPFS integration result is added.

OPFS publication and budget tests now cover incomplete commit, plaintext-only
publication, retained successful output, cleanup after publication failure, and
chunk/count/aggregate staged-byte limits. A failed-publication reuse assertion
was shown failing, then fixed by introducing a cleanup-only failed state. A
failed session rejects further writes and can be aborted. Eight Chromium store
and staging tests pass, with strict types and targeted lint. Engine/OPFS end-to-end,
crash recovery, physical quota behavior and real phones remain unverified.

Browser engine/core staging is now added without a bundler or new dependency.
Compiled module imports are rewritten to local staged modules and the existing
pinned cborg/pako assets, with license notices preserved. The Chromium module
graph test passes and confirms engine/core entry loading plus native crypto/OPFS
availability. This is a load test, not the pending authenticated bundle-to-OPFS
integration test. tools/stage-browser-engine.mjs is now in the build pipeline.
All staging code and OPFS changes remain uncommitted pending that integration.

P2-OPFS-ENGINE now passes in Chromium with the actual staged core/engine modules,
independent65,521-byte file fixture and OPFS staging. Successful import publishes
matching plaintext and generates a Receipt accepted against the trusted original.
A trailing-byte variant fails without publication or Receipt. The test uses
native browser crypto and origin-private files. It is not a real-phone or
cross-browser result. Crash recovery, signed durable backup, per-class eviction,
quota exhaustion and the complete two-profile app flow remain pending.

The consistent cache snapshot API was added after a missing-function browser
failure. It reads all selected stores in one readonly transaction with explicit
record/value-byte budgets, owned copies and deterministic ordering. The Chromium
test passes even with a competing two-store update queued after snapshot start,
and rejects count/byte overruns. Root types and targeted lint pass. This captures
metadata bytes only. Engine snapshot schema, OPFS inventory consistency and atomic
restore remain pending. Work is uncommitted and has no phone result.

## Consistent snapshot and atomic replacement

P2-STORE-RESTORE was shown failing with a missing replaceAll method before
implementation. replaceAll now prevalidates and copies the complete record set,
rejects duplicate store/key pairs, and clears/repopulates all working stores in
one transaction. Empty input explicitly clears all records. P2-STORE-ROLLBACK
injects a put failure after clear requests and checks that previous records
remain. It also checks duplicate rejection and empty replacement.
These operations cover metadata bytes. Engine schema validation, OPFS inventory
consistency and stale-counter recovery remain pending. No real-phone result is
established by Chromium automation.

Validation for this increment passes 164 unit tests, 187 independent vector
comparisons, 27 Chromium browser tests, strict TypeScript, lint, two foundation
tests and 139 dependency license checks. Eight browser tests target the store
snapshot/replacement behavior and earlier store contracts. No claims-ledger row
was added. Full application restore and real-device storage validation remain
pending.

## Backup snapshot boundary

The engine backup acceptance suite first failed because the module did not
exist. It now covers snapshot capture, native envelope round trip, mandatory
application validation before replacement, wrong entropy, tampering, truncation,
unknown envelope version, duplicate/unknown/over-budget records, failed final
replacement, limits/entropy capture and disposable validator buffers. Authenticated
malformed inner snapshots test unsupported versions, tuple shapes and ordering.
ADR 016 records the exact deterministic snapshot framing.

P2-BACKUP-BROWSER passes with the actual staged engine/core/store modules,
native browser crypto and IndexedDB snapshot/replacement. It restores a synthetic
byte record, removes intervening state, forwards the contact-resynchronization
requirement and invokes no replacement after tampering. This does not implement
production identity/contact/outbox validators or persist the resynchronization
requirement in an application session. OPFS inventory and real-device restore
remain pending. There is no production UI caller yet.

This increment passes 171 unit tests, 187 independent vector comparisons,
28 Chromium tests, strict types, lint, foundations and license checks. The
Chromium suite completed in 6.4 seconds on the development Mac. No new dependency
or claims-ledger row was added. No real-phone behavior was verified.
