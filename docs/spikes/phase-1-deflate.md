# Phase 1 bounded deflate candidate report — 2026-11-15

## Task, phase and commit

Implement and measure the deflate candidate needed by Phase 1's compression
stage. Base commit is 6cf700e on phase-1/protocol-core. The implementation commit
and remote CI result accompany the handoff. D-2's final choice awaits phone
measurements. D-8's external streaming-encryption review is outstanding.

## Implementation and choices

ADR 006 records native CompressionStream encoding and pako 3.0.3 low-level
decoding with caller-owned buffers. Both byte budgets are explicit and input is
copied before processing. Decoder buffers are capped at 16 KiB, with one sentinel
byte beyond the remaining output allowance. The decoder runs synchronously and
returns a Promise result. A finally block ends its state on every initialized
path. Successful output assembly retains at most twice the output allowance plus
one decoder block, alongside the input snapshot and fixed decoder workspace.

Strict RFC 1950 handling requires checksum validation, stream end and zero
trailing bytes. Raw deflate, gzip, concatenation and dictionaries are rejected.
The module adds zero wire records. Envelope compression markers, padding and
Box integration remain pending. Native compressor workspace and browser/phone
costs need separate measurements.

### Native decoder investigation

The first candidate used DecompressionStream. In 16 trials for each 1/4/16 KiB
feed size, all 8163 compressed bytes of an 8 MiB expansion were fed before the
16384-byte output-limit failure. Smaller feeding did not establish an internal
memory bound. This finding led to the decoder change. The raw observations and
native algorithm baselines are in phase-1-native-deflate-measurements.json.

The fixed-buffer regression inspects actual low-level decoder calls. With a
16384-byte allowance it produces exactly 16385 bytes and stops, with each output
buffer at most 16384 bytes. Cleanup is called once. The rejected operation
returns zero partial output bytes.

### Dependency review

Pako 3.0.3 is pinned, MIT AND Zlib, with zero runtime transitive dependencies.
Its tarball is 604043 bytes, unpacked 2500536 bytes. The main ESM module is
96667 bytes, locally gzipped to 20787 bytes. Public low-level exports and bundled
types are used. Source and buffer control were inspected. Independent audit of
this release has not been established. The license check passes and the locked
advisory audit reports zero findings. App bundle size needs its later build.

## Tests run

The acceptance suite first failed for the missing module. The native candidate
subsequently passed its initial tests, with the resource-bound finding above
requiring a decoder change before adoption. The final 9 compression tests pass.
They cover independent fixtures, strict framing, empty/1-byte/1-KiB/16-KiB/5-MiB
round trips, classic zlib interoperability, exact and exceeded output bounds,
input caps before construction, detached and invalid input, invalid limits,
mutation isolation, unavailable native compression, stream-stage cleanup and
fixed-buffer decoder overflow. The workspace test inspects actual produced bytes.

FUZZ-DEFLATE uses seed 0x44460002 for 1000 malformed inputs. All return typed
invalid-data results. Python/zlib independently verifies 4 valid and 8 invalid
fixtures, 12 new checks. The complete independent vector total is 79.

Final local checks pass 1 foundation test, 52 Vitest tests and 3 browser
regressions, 56 tests total. Strict types, builds, typed lint, all 79 independent
checks and 137 installed dependency-license checks pass. The advisory audit
reports 0 findings across 167 locked dependencies.

## Measured

Mac arm64, Node v24.11.0, no network, 16 trials per operation. Median is the mean
of the central sorted values. p95 uses nearest rank, which is the maximum with
16 trials. Cold-start samples are retained. Core measurements import the compiled
public ESM entry point. Raw samples are in phase-1-deflate-measurements.json.

| Fixture | Input bytes | Deflate bytes | Compress median/p95 ms | Decode median/p95 ms |
|---|---|---|---|---|
| Repeated chat text | 1024 | 35 | 0.146/3.580 | 0.026/0.376 |
| Repeated byte | 1048576 | 1040 | 7.136/11.386 | 1.888/2.713 |
| Seeded random bytes | 1048576 | 1048907 | 20.495/23.403 | 0.756/0.844 |

The 8 MiB expansion fixture is 8163 compressed bytes. Rejection under a 16384-byte
allowance measured 0.198 ms median and 0.245 ms p95 across 16 trials.
The 1000-input fuzz run took 12.159 ms, with a slowest call of 0.550 ms. Sampled
RSS before that run was 52330496 bytes and reached 64847872 bytes. These are
process observations for this workload.

### Native algorithm baselines for D-2

The separate native-stream report includes synchronous node:zlib deflate/zstd
measurements with runtime defaults, 16 trials. These measure native backends.
The core adapter and a browser/WASM implementation need their own costs.

| Fixture | Deflate bytes | Zstd bytes | Deflate compress median ms | Zstd compress median ms |
|---|---|---|---|---|
| Repeated chat text, 1 KiB | 35 | 35 | 0.010 | 0.008 |
| Repeated byte, 1 MiB | 1040 | 50 | 1.353 | 0.201 |
| Seeded random bytes, 1 MiB | 1048907 | 1048609 | 12.427 | 0.350 |

On this runtime, native CompressionStream and DecompressionStream accept deflate
and reject zstd with TypeError. Node's classic zstd API is present and documented
as experimental in the pinned runtime. These observations leave D-2 pending the
target-phone and implementation-size comparison.
[Node v24.11.0 zstd API](https://nodejs.org/download/release/v24.11.0/docs/api/zlib.html#zlibzstdcompresssyncbuffer-options).

## Not verified on a real device

The module ran in Node on the Mac. Browser and phone execution, codec memory on
Xiaomi/iPhone, background responsiveness, zstd browser/WASM cost and full Box
interoperability remain unverified. Existing browser regressions exercise the
separate diagnostic harness. Offline-hotspot testing remains pending at the
owner's request.

## Claims ledger rows added or changed

VEC-DEFLATE and DEFLATE-ROUNDTRIP/BOUNDS/INPUT/SNAPSHOT/UNAVAILABLE/CANCEL/WORKSPACE
record component behavior. FUZZ-DEFLATE and DEFLATE-MEASURE record hostile-input
and timing observations. DEFLATE-NATIVE-FEED retains the failed feed-size
assumption and the observation that changed the implementation.

## Known problems

D-2 needs target-phone measurements before the final algorithm choice. The
decoder's Promise API executes synchronously. Native compressor workspace and
app bundle size need platform measurements. Complete small/chunked sealing,
padding, receipts and full Phase 1 acceptance remain pending. D-8 requires the
external cryptographer review the owner confirmed is unavailable.

## Files changed

- README.md
- docs/adr/002-phase-1-envelope-decisions.md
- docs/adr/006-bounded-deflate-candidate.md
- docs/claims-ledger.md
- docs/spikes/phase-1-deflate-measurements.json
- docs/spikes/phase-1-native-deflate-measurements.json
- docs/spikes/phase-1-deflate.md
- packages/core/README.md
- packages/core/package.json
- packages/core/compression.test.ts
- packages/core/src/compression.ts
- packages/core/src/config.ts
- packages/core/src/index.ts
- packages/test-vectors/README.md
- packages/test-vectors/deflate.json
- pnpm-lock.yaml
- tools/verify-vectors.py
