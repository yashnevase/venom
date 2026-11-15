# 007 — Browser zstd comparison tool

## Status

Adopted for diagnostic D-2 measurement in Phase 1 under the owner's
measurement-first approval. The Mac and Xiaomi reports are recorded in
`docs/spikes/phase-1-compression-comparison.md`. ADR 006 selects bounded deflate
for v1. This zstd dependency remains development-only.

## Problem and decision

The Xiaomi's native compression constructors reject zstd. The browser/WASM
implementation costs have been measured to compare against the current deflate
candidate before selecting the v1 compression format.
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

## Allocation assessment — 2026-11-15

D2-ZSTD-ALLOCATION measures the published browser wrapper with a 12-byte malformed
frame. Its single-segment header declares 33554432 output bytes, while its final
raw block is empty. The fixture follows RFC 8878's header layout and deliberately
has inconsistent content. A test allocator hook blocks every request above
1048576 bytes before the original allocator executes. The caller also supplies
defaultHeapSize=1048576. The wrapper requests 12 source bytes followed by
33554432 output bytes. The guard stops that second request. This establishes
that defaultHeapSize acts as the unknown-size fallback and does not cap a known
declared size. Full-frame decoding has not started at that point.
[RFC 8878 frame content size](https://www.rfc-editor.org/rfc/rfc8878.html#section-3.1.1.1.4)

The injected exception occurs before the wrapper's try/catch cleanup block.
The probe observes its 12-byte source allocation still live, restores both
allocator functions, and frees that source itself. This cleanup observation
is specific to the injected exception. Actual out-of-memory behavior remains
unmeasured. WASM linear memory stays at 16908288 bytes throughout, and a control
round trip succeeds after restoration. The large allocation is never performed.

The browser acceptance first failed on the absent probe module, then passed.
It verifies the saved WASM/wrapper/probe hashes against staged files. The raw
record is docs/spikes/phase-1-zstd-allocation-review.json. Reproduce after building
with `node tools/run-zstd-allocation-probe.mjs` while the local static server runs
on port 8322. The helper is invoked only by the explicit probe and acceptance.
The ordinary phone benchmark continues to use its fixed public fixtures.

The current wrapper needs an explicit output-allocation bound before production
adoption. The D-2 phone comparison is complete, and ADR 006 records the deflate
selection alongside this resource result. This assessment preserves the
diagnostic-only adoption scope of this dependency.
