# 006 — Bounded deflate candidate

## Status

Selected for v1 D-2 under the owner's delegation to continue ADR 002's
measurement-first work. Comparative measurements cover Mac Chromium and the
owner's Xiaomi Note 13. Deflate's Xiaomi result is recorded in phase-1-deflate.md,
and the deflate/zstd comparison is in phase-1-compression-comparison.md. This
selects the codec only. Box schema integration and limits still require the
protocol freeze. D-8's external review remains outstanding.

## Problem and measurement

The compression stage needs an input cap, an output cap, strict RFC 1950 framing
and bounded decoder workspace. Native DecompressionStream only exposes output
after implementation-defined internal work. In 16 trials, an 8163-byte stream
expanding to 8 MiB was fully fed before a 16384-byte output-limit failure, even
with 1024-byte input pieces. Smaller feeding did not establish an internal-memory
bound. Raw observations are in phase-1-native-deflate-measurements.json.

## Options and decision

Use native CompressionStream for compression and pako 3.0.3's public low-level
inflate API for decompression. A fixed output buffer is supplied on every decoder
call. Each call can produce at most the remaining output allowance plus one
sentinel byte, capped at 16 KiB. Crossing the allowance stops immediately and
returns a typed error. The decoder is ended in a finally block.

Native-only decoding leaves its internal allocation unbounded by the caller's
output budget. An independent hand-written deflate decoder would add protocol
parser maintenance. Pako supplies the existing standard decoder with caller-owned
output storage. It is a compression dependency. Cryptography continues through
WebCrypto. [Pako source](https://github.com/nodeca/pako/tree/3.0.3).

Use windowBits=15 for zlib framing, require stream end, a correct checksum and
zero remaining input. Dictionaries, raw deflate, gzip, trailing data and
concatenated streams return typed failures. The byte format follows the
Compression Standard's deflate rules. Compressed encoder bytes can vary across
implementations. Fixtures compare decoded data and rejection behavior.
[Compression Standard](https://compression.spec.whatwg.org/#deflate).

The caller supplies maxInputBytes and maxOutputBytes, including zero. Accepted
input is copied before codec work. Output assembly retains at most twice the
output allowance plus one decoder block, alongside the input snapshot and fixed
decoder workspace. Output blocks are at most 16 KiB, and the zlib history window
is at most 32 KiB. Native compressor
workspace and browser process memory need device measurements.

COMPRESSION_FEED_BYTES=1024 controls native compressor input pieces. The new
DEFLATE_OUTPUT_BYTES=16384 controls decoder buffers. Both live in config.ts.
They are internal processing limits. Wire bucket, frame and chunk defaults stay
at their documented targets. Compressed encoder bytes can vary across
implementations. Receivers accept the RFC 1950 zlib-wrapped deflate format and
enforce the approved output cap while decoding.

## Dependency review

Pin pako 3.0.3, published 2026-10-26, with zero runtime transitive dependencies.
The package license is MIT AND Zlib. The npm tarball is 604043 bytes, unpacked
2500536 bytes. The main ESM module is 96667 bytes, 20787 bytes under gzip in the
local archive inspection. These describe the package module. The eventual app
bundle requires its own size measurement. [Package metadata](https://registry.npmjs.org/pako/3.0.3).

The package includes its TypeScript declarations. The used low-level APIs are
public exports. Source and output-buffer control were inspected for this use.
An independent security audit of this release has not been established. The
locked advisory and license checks must pass before commit. The dependency adds
no crypto library or runtime service.

## Verification

Acceptance tests precede implementation. They cover independent Python/zlib
fixtures, exact framing, size boundaries, expansion rejection, cleanup, mutation
isolation and malformed-input fuzzing. A decoder regression must inspect the
number of produced bytes at the failure boundary. Node results and phone gaps
are recorded separately in phase-1-deflate.md. This component alone cannot pass
the complete Box or Phase 1 gates.

## D-2 comparative selection — 2026-11-15

Select zlib-wrapped deflate for v1. Both codecs produced 35 bytes for the 1 KiB
chat fixture. At 256 KiB, zstd produced 26 bytes versus deflate's 278 on the
repeated fixture, and 262159 versus 262232 on seeded random data. On Xiaomi
Note 13 / Android 16, zstd median compression/decompression was 5.20/1.10 ms for
repeated data and 4.00/1.15 ms for random data; deflate was 9.40/2.75 ms and
13.35/2.05 ms. Across the same fixtures, zstd was faster and often smaller.

The browser zstd build adds 273710 raw bytes (87585 per-file gzip bodies) and
used 16908288 bytes of WASM linear memory. The tested wrapper requested a
33554432-byte output allocation for a 12-byte frame declaring that size, despite
defaultHeapSize=1048576. The controlled probe blocked that allocation before it
occurred. The existing deflate decoder writes into caller-sized buffers and
stops at its configured output bound. For the project's low-resource target,
bounded decoding and smaller runtime footprint outweigh zstd's measured speed
and compression gains. The zstd package remains a development-only diagnostic.

Raw Xiaomi report `docs/spikes/phase-1-compression-xiaomi-note-13.json` is
preserved unchanged. Its SHA-256 is
`0a8bbfdecc029d5a527ad2361e292b4d54026ca4ce8ef3ff3a603249c4386115`. The owner
identified the device as Xiaomi Note 13 / Android 16; report device notes are
empty and its reduced user agent says Android 10 K / Chrome 157. The test ran
over local HTTP with `secure_context=false`. It does not establish behavior on
iPhone, other Android devices, installed HTTPS origins, large files, process
memory or battery.
