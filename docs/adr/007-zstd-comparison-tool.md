# 007 — Browser zstd comparison tool

## Status

Adopted for D-2 measurement in Phase 1 under the owner's measurement-first
approval. The owner is operating the Xiaomi diagnostic. The next comparison
uses the same public fixtures and trial counts as the recorded deflate run.

## Problem and decision

The Xiaomi's native compression constructors reject zstd. D-2 still needs the
browser/WASM implementation costs before selecting the v1 compression format.
Use @bokuweb/zstd-wasm 0.0.27 as a pinned development dependency for the diagnostic.
Run level 3 on fixed public fixtures of at most 256 KiB. Record module transfer
size, load/initialization time, linear-memory size, compressed bytes and timings.
The protocol's production compression implementation remains the ADR 006
candidate while this measurement is collected.

The package has zero runtime dependencies. Its tarball is 257075 bytes and its
unpacked size is 903925 bytes. Browser WASM is 251806 bytes and the browser
JavaScript modules total 21904 bytes. The TypeScript glue is MIT and the upstream
zstd code is BSD-3-Clause. Notices accompany the staged files. The package
README records this license split. [Pinned source](https://github.com/bokuweb/zstd-wasm/tree/87277ab93c2861d6c265a2ff43c7e7fb14d9a8c5).

Source inspection found that decompression allocates according to a frame's
content-size field. The diagnostic only passes frames it generated from its
fixed public fixtures. This wrapper needs a separate resource-bound assessment
for hostile Box input. The upstream build script selects the latest zstd tag
without recording it in package metadata. The npm artifact and staged module
hashes are pinned for reproducible measurements. Independent audit of this
release has not been established. Advisory and license checks must pass.

The package's browser module graph is served unchanged with import-map entries
for its extensionless relative imports. The page has a 15-second initialization
deadline so asset failures produce a diagnostic result. This is a tool deadline.
Protocol sizes, retry policy and wire records remain governed by docs/04 and /11.

## Verification

Write browser acceptance tests before implementation. After assets initialize,
block further HTTP and run both codecs. Require all fixture round trips and
192 timed calls. Check zstd interoperability in both directions against the
existing Node native API. Record missing-WebAssembly failure. Phone timing and
unverified platform results belong in docs/spikes and the claims ledger.
