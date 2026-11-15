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
