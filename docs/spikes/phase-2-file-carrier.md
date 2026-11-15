# Phase 2 manual file carrier

Experimental, not independently reviewed.

## Task and phase boundary

Start Phase 2 with the file carrier in docs/03. Phase 1 recovery revision 51e129e
passed CI runs 43698351178 and 43698346187 before branch phase-2/file-web was
created. Its development-gate evidence is phase-1-gate-audit.md. This task changes
no core implementation. It adds the manual opaque-byte adapter only.

## Acceptance and implementation

The first acceptance run failed because the carrier module was absent. Thirteen
carrier tests now cover opaque exports, Blob slice reads, invalid/oversized
source declarations, truncated/excessive source bytes, write backpressure, copy
ownership, source-factory snapshots, adapter failure, abort, commit, explicit
retry, independent concurrent exports, routing-filter snapshots, enumeration
bounds and early-consumer source closure. The module exports the decided Carrier
methods and capabilities. Its SealedBox source factory is an in-process interface,
with wire/container bytes supplied by the engine. ADR 014 records that boundary.

The declared size is checked before opening the source or export writer. Each
buffer is checked before copying. Writes are awaited. Commit follows exact-length
source completion. Failures abort staging and return typed results. Read/import
iterators close on early exit. The adapter owns any user prompts, staging medium
and I/O cancellation. The carrier neither records delivery nor applies retries.
An exported outcome records only the supplied writer's commit. If an abort itself
fails, the adapter must clean staging during recovery.

## Measurements and check scope

P2-FILE-STREAM used a Mac arm64 Node 24.11.0 in-memory counting writer. It exported
5242880 bytes in 320 writes, largest write 16384 bytes, one successful commit.
The single observed elapsed time was 1.49525 ms. Raw JSON is retained alongside
this report. The measurement covers byte plumbing and no filesystem, browser
download, phone, memory-profile or user-visible transfer-speed result.

The final local check passed 145 unit tests, 181 independent vector comparisons,
strict types/build/lint, 139 installed package-license checks and the pinned MIT
data checks. Existing diagnostic browser tests passed 14 cases. Advisory audit
reported zero findings. The implementation commit is in the task handoff. The
first full run reached 145 passing unit tests but could not run vectors because
the prior temporary Python environment was absent. The pinned environment was
recreated for the final run. Existing diagnostic browser tests remain separate
from browser file-export/import integration.

No runtime/build dependency was added. A workspace importer was added to the
lockfile. The package compiles strict declarations and ships the experimental
status file. Carrier/module documentation describes partial-output and source
ownership contracts. Claims ledger rows record local test observations only.

## Outstanding Phase 2 work and real-device gaps

Engine bundle assembly/validation, durable signed backup, working-set storage,
outbox state, identity/contact setup and the minimal responsive app remain Phase 2
tasks. The complete acceptance flow is still pending between two fresh profiles
with network disabled. Browser file-picker, actual download/share, OPFS/IndexedDB,
Mac browser, Android Chrome and iPhone Safari results remain unverified for this
carrier. No phone result is inferred from Node Blob tests.

## Files changed

- packages/carriers/file/src/index.ts, file.test.ts, package.json, tsconfig.json,
  README.md
- package.json and pnpm-lock.yaml
- tools/build-notice.mjs and tools/review-notice.test.ts
- docs/adr/014-file-carrier-boundary.md
- docs/spikes/phase-2-file-carrier.md and phase-2-file-carrier-measurement.json
- docs/claims-ledger.md and docs/test-matrix.md
- docs/adr/008-box-envelope-review.md and docs/spikes/phase-1-gate-audit.md, recording
  the completed remote Phase 1 CI evidence
