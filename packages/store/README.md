# Browser working-set cache in progress

Experimental, not independently reviewed.

Initial IndexedDB adapter follows the named object stores in docs/11. Records
are engine-owned encoded bytes, keyed by bounded strings. The engine must
validate schemas and protect secret fields before persistence. IndexedDB is the
working set. The signed export remains the durable copy.

openCache accepts explicit record/batch limits. writeBatch snapshots bytes
before its atomic transaction. get returns owned bytes. Version changes close
the connection. One Chromium acceptance test was shown failing before the
module existed, then passed for multi-store writes, reopening and an oversized
record rejection. No phone, Safari, signed-backup or import-staging integration
result exists yet.

Work is uncommitted. Schema/index validation, browser failure/upgrade tests,
quota accounting, package/build/staging wiring and module acceptance remain
pending. Store code compiles in its own DOM project so browser declarations do
not change the protocol core's native BufferSource typings. Root checks exclude
store source and browser tests use its built declaration API.

inspectStorage reports the browser's advisory usage/quota estimate and existing
persistence status. nearCapacity means at least 80% of estimated quota is used,
applying the warning threshold in docs/11 to the browser estimate. Remaining
space is clamped at zero. Unsupported/invalid estimates return available=false.
requestPersistence is a separate explicit UI action and returns the browser's
grant result. Estimates do not reserve capacity or guarantee later writes.
Per-class accounting, physical device free-space measurement, eviction and
quota-aware import staging remain pending integration.

createImportStaging now provides an OPFS directory per import, bounded sequential
ciphertext/plaintext writes, indexed reads, explicit commit and abort cleanup.
Its publication callback must atomically establish visibility in the engine's
metadata transaction, and must resolve only after that transaction succeeds.
The adapter itself establishes no message authenticity. Engine verification must
precede commit. Failed publication requires abort rather than resuming reads,
because ciphertext cleanup can have started. Concurrent write/commit/abort
operations are rejected while a write/publication is active. Chromium tests cover abort, publication, failed-publication cleanup and staging
budgets. The actual engine imports an independent 65,521-byte fixture through
OPFS and returns a Receipt. A bad tail publishes nothing. Crash recovery, real
quota exhaustion and real-phone results remain pending.

snapshot(stores, limits) reads selected stores inside one readonly transaction,
returning owned byte records sorted by store and key. It bounds record count and
record-value bytes and rejects incompatible keys/values. The byte budget covers
values, while the record-count/key-length limits bound metadata overhead.
The engine still validates decoded schemas before backup export or restore.
Chromium coverage includes a competing multi-store update queued after snapshot
creation, plus count/byte limit rejection. Physical disk snapshotting and OPFS
file inventory consistency remain separate backup-engine work.

replaceAll(records) replaces every working-set store in one readwrite transaction.
It checks the full record set, operation count, per-record byte limit and unique
store/key pairs before starting that transaction. Inputs are copied before use.
An empty record set clears the working set. A transaction failure rolls back its
clears and writes. The engine must validate backup identity and record schemas
before calling this operation. This primitive covers IndexedDB metadata only.
It does not coordinate OPFS files or decide stale-counter recovery policy.
