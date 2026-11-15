# 014 — File carrier boundary for Phase 2

## Status

Accepted implementation detail for the file carrier in docs/03 and Phase 2 in
docs/05. Experimental, not independently reviewed.

## Decision

Keep the decided Carrier methods and capabilities. Represent the opaque carrier
input as a declared byte size and a fresh async byte-source factory, so file
adapters can stream data without one whole-file array. This representation is an
in-process interface. Protocol bytes remain the versioned deterministic CBOR
records from docs/04. Engine bundle framing, verification, signing and storage
policy are separate Phase 2 work.

FileCarrier takes caller-owned adapters for availability, transactional export
and manual imports. A writer must support write, commit and abort. Commit is
allowed only after the source ends at its declared size. Abort discards staging.
Successful export reports manual export completion. Delivery and held state
require the engine's later evidence. The carrier neither opens records nor
holds keys, retries, schedules or parses protocol bytes.

A bounded source rejects invalid advertised sizes before opening a stream,
limits each yielded buffer to a caller-supplied read bound before copying,
tracks total bytes, snapshots each yielded buffer and closes the iterator after
failure or consumer cancellation. Export backpressure awaits each write. An
import source yields immutable envelopes whose bytes get the same bounds on
consumption. The adapter filters supplied routing tags and since values using
engine-owned metadata. No content is decoded to obtain a tag.

All byte/count limits are explicit caller policy because reliable browser file
limits await S-7 and device results. These transport ceilings do not change
protocol frame/chunk sizes or other docs/11 defaults. The engine must select a
limit compatible with its record/container and storage quota. No runtime or
build dependency is introduced.

## Verification

Acceptance first, including ordinary opaque import/export, source bounds,
mutation snapshots, partial source, writer failure, abort, backpressure,
consumer cancellation, concurrent/repeated operations and unopened oversized
imports. These tests use in-memory adapters. Browser file-picker, OPFS/IndexedDB,
download and real-phone behavior remain unverified until integrated. Network
chaos belongs to network carriers. File export fault/cancellation tests exercise
this carrier's manual-path errors.
