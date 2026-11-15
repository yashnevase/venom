# Manual file carrier

Experimental, not independently reviewed.

Phase 2 adapter for the Carrier interface in docs/03. The engine supplies opaque
versioned bytes and routing metadata. This module calls no network API, handles
no keys and applies no content parsing or retry policy. Browser file selection,
transactional local staging and engine bundle interpretation remain separate
Phase 2 integration tasks.

## API

```ts
import { FileCarrier, sourceFromBlob } from '@openmesh/carrier-file';

const carrier = new FileCarrier({
  maxBoxBytes: localPolicy.maxTransferBytes,
  maxReadBytes: localPolicy.readBytes,
  maxPollRecords: localPolicy.maxImportRecords,
  available: fileAdapters.available,
  beginExport: fileAdapters.beginExport,
  readImports: fileAdapters.readImports,
});
const result = await carrier.put(sourceFromBlob(selectedFile, localPolicy.readBytes));
```

SealedBox is an in-process declared size and an open() factory. Each open must
produce a fresh stable source. Data bytes use the wire records/container selected
by the engine. The carrier copies one yielded buffer at a time, checks total
length and awaits writer backpressure. Explicit caller limits control total
transfer size, maximum read size and manual enumeration count. The current
routing filter cap is the docs/11 tag-window value 64. All limits are enforced
before opening an oversized record. Blob sources use slices rather than a
whole-file arrayBuffer call.

beginExport returns an independent FileWriter for each call. write stages bytes,
commit atomically finalizes the file and abort discards incomplete staging.
Adapters must make abort effective even after a failed commit attempt. A source
or writer failure aborts the transfer and returns a typed outcome. An abort
failure returns export-failed and requires the adapter to clean its staging on
recovery. The adapter owns cancellation of user prompts and pending I/O.

An exported outcome means the supplied writer committed successfully. The engine
must wait for a valid Receipt before recording Delivered. The honest carrier
label is Manual. No automatic held state or outgoing retry is generated here.

poll snapshots tag/since filters immediately, delegates filtering to readImports
using engine-owned metadata, bounds enumeration and returns a capped fresh source
per record. Empty filters support explicitly selected manual imports. Polling
and consuming a source can throw FileCarrierError with a code, which the engine
must handle. Early consumer exit closes the corresponding async iterator. Import
sources remain caller-owned and are not destructively dequeued by this module.
Repeated imports/delivery deduplication belong to the engine/store.

## Acceptance evidence

The first acceptance run failed with the module absent. The module tests cover
opaque transport, Blob slices, declarations and read bounds, copy ownership,
backpressure, partial sources, adapter failure/abort, source closure, filter
snapshots, concurrent/repeated sends and a 5 MiB transfer in 320 writes of 16 KiB.
No runtime dependency was added. Raw checks and real-device gaps are recorded in
docs/spikes/phase-2-file-carrier.md. Browser file-picker/download, local storage,
real phones and the complete two-profile Phase 2 flow remain pending.

## Bounded Blob export staging

createBlobWriter(declaredSize, maxBytes, publish) supplies a FileWriter for small
explicitly capped artifacts. Writes are copied into in-memory staging. Commit
requires the exact declared byte count and calls publish once with the finished
application/octet-stream Blob. The publisher owns file naming, download-link
lifetime and user interaction. A completed callback establishes only artifact
publication, not delivery or a completed browser download. Use an on-disk writer
for transfers beyond the application's measured in-memory limit. Abort discards
unpublished pieces. Once publication starts, cancellation belongs to the
publisher. Node tests cover copy ownership, length checks, abort, concurrent
commit rejection and publisher failure. Browser downloads remain unverified.
