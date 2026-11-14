# 006 — Bounded deflate candidate

## Status

Adopted for the Phase 1 compression component under the owner's delegation to
continue ADR 002's measurement-first work. D-2's final algorithm choice awaits
comparative target-phone measurements. Deflate's Xiaomi result is recorded in
phase-1-deflate.md. This component exercises the deflate candidate already
permitted by docs/04. D-8's external review remains outstanding.

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
at their documented targets. Measurements compare the implementation's component
costs and the native deflate/zstd baselines before any D-2 selection.

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
