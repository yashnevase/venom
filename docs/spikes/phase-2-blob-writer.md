# Phase 2 bounded Blob staging

Experimental, not independently reviewed.

Task is the manual file carrier's bounded in-memory export adapter. Base commit
7533f6c. Three acceptance tests initially failed with the module absent, then
passed after implementation. All sixteen file-carrier tests pass. Strict types
and carrier lint pass. No new dependency or protocol format was introduced.

The publisher callback receives an artifact only after its exact declared byte
count is staged. Tests check byte ownership, partial/oversized operations,
abort, repeated/concurrent commit and publisher failure. No timing or device
measurement was made. This adapter intentionally retains explicitly capped
artifact bytes in memory. Large-file on-disk staging and the caller's measured
memory ceiling remain integration tasks.

No actual browser download, storage, file picker or phone run was performed.
The publisher callback owns user interaction and cancellation once invoked.
Full Phase 2 offline bundle flow remains pending. Claims ledger row P2-BLOB
records the local fixture result.

Files changed are packages/carriers/file/src/blob-writer.ts, src/index.ts,
blob-writer.test.ts and README.md, this report and docs/claims-ledger.md.
