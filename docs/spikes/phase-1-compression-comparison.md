# Phase 1 browser compression comparison — 2026-11-15

## Task, phase and commit

Prepare D-2's deflate/zstd comparison on the same browser fixtures. Base commit
is bb814d0 on phase-1/protocol-core. The implementation commit and remote CI
result accompany the handoff. The earlier Xiaomi deflate report remains saved.
The comparison page has been sent to the owner for the next phone run.

## Implementation and choices

ADR 007 adopts @bokuweb/zstd-wasm 0.0.27 as a development dependency for the
diagnostic. The same public fixtures and 16 trials per operation run through the
current core deflate candidate and zstd level 3. Fixture creation, frame yields,
caller copies and equality checks are outside timed codec calls. Cold samples
are retained. The diagnostic compares each decode with the original fixture.
The deflate output-limit test is retained.

The zstd wrapper allocates according to frame content size. It receives only
fixed public fixtures and its own generated frames in this diagnostic. Hostile
payload resource control needs separate assessment for production adoption.
Its upstream build script does not pin the zstd source tag. The npm artifact
and staged binary/glue hashes identify the measured implementation.

Source declares MIT for the TypeScript glue and BSD-3-Clause for zstd. The
published package lacks a separate MIT copyright notice. The diagnostic stages
the upstream attribution and BSD notice alongside the files. Independent audit
of this release has not been established. The advisory audit reports 0 findings
across 168 locked dependencies, and 138 installed license checks pass.

## Tests run

D2-COMPARE failed with a 404 before the page existed. It then passed with all
12 timing summaries, 192 timed calls and zero further HTTP after initialization.
Native-to-WASM and WASM-to-native fixtures agree through Node's independent
classic zstd API. D2-WASM-UNAVAILABLE passes with WebAssembly removed. The earlier
deflate and S-2 browser regressions pass. The combined suite has 1 foundation
test, 52 Vitest tests and 7 browser tests, 60 total. All 79 independent protocol
vector checks, strict types, builds, typed lint and license checks pass.

## Measured

Mac arm64, headless Chromium 159, local static HTTP. Sixteen trials per operation.
Median averages the central values and p95 is nearest rank, the maximum at this
sample count. Raw output is phase-1-compression-comparison-mac.json.

| Fixture | Deflate bytes | Zstd bytes | Deflate compress/decode median ms | Zstd compress/decode median ms |
|---|---|---|---|---|
| Chat, 1024 bytes | 35 | 35 | 0.100/0.200 | 0.200/0.100 |
| Repeated byte, 262144 bytes | 278 | 26 | 4.450/0.600 | 0.950/0.200 |
| Seeded random, 262144 bytes | 262232 | 262159 | 4.850/0.300 | 1.450/0.400 |

The additional zstd browser assets total 273710 raw bytes, comprising 251806
WASM bytes and 21904 JavaScript bytes. Per-file gzip bodies total 87585 bytes,
80362 WASM and 7223 JavaScript. These are staged dependency assets. The later
application bundle needs its own build measurement.

This run observed 7.400 ms for JavaScript import and 4.400 ms for WASM load and
initialization. They include local asset loading and execution, with one
observation each. The WASM linear memory was 16908288 bytes before and after
the trials. Browser process memory and battery were unmeasured. Current deflate
costs include its 1 KiB compressor input feeding and bounded JavaScript decoder.
These compare the selected implementations under the diagnostic workload.

## Not verified on a real device

The previous deflate-only Xiaomi result is in phase-1-deflate.md. The new
comparison still needs its phone report. iPhone execution, process memory,
battery, large-file behavior and complete Box interoperability remain unverified.
Identity and HPKE have separate device gaps. D-8's external review is outstanding.

## Claims ledger rows added or changed

D2-COMPARE and D2-WASM-UNAVAILABLE record browser completion, independent fixture
interoperability and unavailable-runtime behavior. D2-COMPARE-MAC records the
selected implementation costs, asset bytes and observed WASM memory.

## Known problems

D-2's final choice awaits the comparative phone report. The zstd wrapper needs a
production resource-bound assessment. Its upstream source version is unrecorded
in package metadata. Full Phase 1 small/chunked sealing, padding and receipts
remain pending. D-8 requires the external cryptographer review the owner
confirmed is unavailable.

## Files changed

- docs/adr/007-zstd-comparison-tool.md
- docs/claims-ledger.md
- docs/spikes/phase-1-compression-comparison.md
- docs/spikes/phase-1-compression-comparison-mac.json
- package.json
- pnpm-lock.yaml
- tools/compression.browser.test.ts
- tools/spikes/README.md
- tools/spikes/compression-probe.ts
- tools/spikes/compression-compare.html
- tools/spikes/zstd-NOTICES.txt
- tools/stage-compression-spike.mjs
