# Offline bundle engine

Experimental, not independently reviewed.

Phase 2 bundle module implementing ADR 015 over the existing core and manual
file carrier. No new executable dependency is introduced. Import the public
@openmesh/engine entry and the same @openmesh/core package instance throughout
an application. Mixing direct core source imports and built core imports creates
separate module-local verified-handle registries.

## Export

createVerifiedBundleSource takes exact Box and optional Manifest bytes, a fresh
async ciphertext source, output read size and a total byte quota. It snapshots
bounded metadata, checks profile/Manifest hash/chunk-size linkage and computes
an exact carrier source size. It checks each staged ciphertext length/hash
before emitting it. The FileCarrier aborts its writer if the source fails.
Sender authenticity is checked by the recipient's core opener.

createBundleSource, encodeBundle and decodeBundle are framing helpers. They do
not establish sender authenticity. Declared chunk sizes let the encoder pull one
chunk at a time. Caller-owned sources must yield stable bytes until consumed.
Array convenience inputs are for already staged small fixtures. Large files
should use the fresh async source factory. Read limits and quotas are explicit.

## Import transaction

importBundle captures contact policy and bounds before asynchronous reads. It
opens the Box using the core API, checks Manifest linkage and chunk hashes,
and stages ciphertext through ImportTransaction. After the entire container
validates, openFile verifies the signed Manifest and each chunk's AEAD while
writing plaintext to staging. Commit runs only after those checks succeed.
Any failure calls abort. Rollback failure returns rollback-failed.

The transaction adapter must keep ciphertext and plaintext unpublished until
commit and discard them on abort. Use disk-backed staging for large files.
Commit must be atomic, and abort must clean a failed commit. The returned
OpenedBox is available only on successful import. Create a Receipt after that
success using the same core package instance. Store application Receipt
deduplication and delivery-state transitions atomically in the later store module.

## Evidence and remaining integration

Ten targeted tests cover canonical framing and single-byte read boundaries,
truncation, extra bytes, version/minimal-length rejection, quotas before opening,
async-source size/count checking, 5 MiB bounded framing, cancellation/source
closure, Manifest/chunk consistency, manual FileCarrier/Blob export, independent
message/file fixtures, Receipts, wrong recipients and transaction failures.
The 5 MiB test measures framing only. Authenticated end-to-end bundle fixtures
cover empty and 65,521-byte files. Phase 1 separately covers 5 MiB core files.

Browser downloads, IndexedDB/OPFS staging, signed backup, UI and real-phone
execution remain pending Phase 2 integrations. This module alone does not pass
the full Phase 2 gate. See docs/spikes/phase-2-bundle-progress.md for the staged
acceptance history and task handoff for final check/commit evidence.
