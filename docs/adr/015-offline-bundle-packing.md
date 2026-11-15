# 015 — Offline file bundle packing

## Status

Development serialization decision for the authorized Phase 2 file export/import
flow. Experimental, not independently reviewed. The protocol records retain
exactly their docs/04 bytes and signatures. This document specifies the carrier
container required to move those records together in a manually selected file.

## Problem

A chunked transfer requires a Box control envelope, its signed Manifest and all
ciphertext chunks. The file carrier in ADR 014 intentionally transports opaque
bytes. Neither docs/04 nor the earlier file-carrier adapter specifies how those
existing records are grouped in one file. Whole-file decoding would violate the
large-file memory rule in docs/11.

## Container

Use one leading version byte 0x01 followed by a single deterministic CBOR array.

```text
0x01 || C([box_bytes, manifest_bytes_or_null, [chunk_bytes_0, ...]])
```

box_bytes is the exact version-prefixed Box from docs/04. manifest_bytes is the
exact version-prefixed standalone Manifest from docs/04. Each record is carried
as a byte string, without re-encoding its interior. The outer three-item array
and chunk array use definite lengths. All byte-string lengths use preferred
shortest CBOR heads. Chunk order is zero-based manifest order. No trailing bytes,
extra records, tags or indefinite items are accepted. A non-chunked Box requires
null Manifest and an empty chunk array. A chunked Box requires its Manifest and
exactly the listed chunks, with exact encoded ciphertext lengths.

This container adds no independent identity, key, signature, receipt or trust
meaning. The engine uses openBox, parseManifest and openFile to authenticate its
existing contents. The signed Box commits to the Manifest hash and the Manifest
to every ciphertext chunk. Receipt eligibility follows the core verified handle.
An unauthenticated outer length never establishes file completeness.

## Streaming and bounds

Before exporting, snapshot bounded control/Manifest bytes and validate profile,
Manifest hash linkage, count and declared sizes. Calculate the exact outer size
with checked arithmetic from CBOR head lengths and recorded chunk sizes. The
source exposes that declared size to FileCarrier, then emits the three-item
array prefix, record byte-string heads and bytes, and the definite chunk-array
head and each bounded chunk. Split output reads to the carrier's chosen read
limit. Read each chunk once from caller-owned staging, verify its length and
hash, and stop on any source error. A failed export must abort the writer.

On import, consume one bounded reader over arbitrary byte boundaries. Read only
the next CBOR head before allocating a field. Check total bundle quota, control
cap 2097152 bytes, Manifest cap 16777216 bytes, chunk count cap 262144 and each
chunk length cap 1048576 before its bytes are buffered. Actual protocol limits
and any stricter caller quota both apply. Check total consumed bytes against the
advertised source size and reject extra or missing bytes. Unknown outer versions
return an unsupported-version outcome before allocating their content.

The engine opens the bounded Box first and validates the Manifest against the
expected contact and Box. It streams plaintext through openFile's awaited staging
callback. Publication/commit occurs only after every chunk and the end of the
outer container validate. A malformed tail or failed source rolls back staged
output. A receipt may be exported only after successful publication. Storage and
outbox transactions remain the following Phase 2 integration modules.

## Acceptance requirements

Write tests before the module. Round trip a message and file through the actual
FileCarrier with Blob staging and a second identity. Verify the Receipt against
the trusted original. Include empty files, 5 MiB streaming, read boundaries inside
every header, wrong recipient, changed Manifest/chunks, every truncation of a
small fixture, extra bytes, unknown versions, excessive CBOR length heads, quota
rejection before reading a payload, failed sources/writers, cancellation and
no published output after a bad final record. No new dependency is needed.

Real browser downloads, storage, Android/iPhone and two-profile offline UI results
remain pending. Node integration establishes only the adapter/core behavior.
