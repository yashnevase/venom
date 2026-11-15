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
