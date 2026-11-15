# 010 — RaptorQ WASM candidate for S-1 measurements

## Status

Accepted for the early codec experiment in docs/05 section 2. The dependency is
development-only. Phase 5's QR carrier and Phase 1's complete Box conformance
remain subject to their existing gates.

## Problem and options

S-1 needs RaptorQ WASM encode/decode costs, memory, battery and QR scan results
on older Android and iPhone hardware. The referenced RaptorQR project publishes
a separate low-level codec. Its native RFC 6330 packet interface allows a
bounded fixture experiment before selecting QR display and scanner libraries.

Options include using the published low-level artifact, rebuilding the Rust
wrapper with a reviewed locked toolchain, or importing the complete RaptorQR
application. Use the low-level artifact for fixed public fixture measurements.
The build plan's later carrier will need its own integration and device tests.

## Dependency budget and provenance

Pin @raptorqr/raptorq-wasm 0.1.1 as a root development dependency. It declares
zero npm dependencies. The npm archive is 131962 bytes and the published unpacked
size is 231080 bytes. The codec's binary is 199574 bytes. Its generated JavaScript
is 10004 bytes and its entry is 116 bytes. Node's default gzip gives per-file
body sizes of 121602, 2517 and 114 bytes, totaling 124233 bytes. The app bundle remains a
separate measurement. SHA-256 values and npm integrity accompany staged assets.
[Published package metadata](https://registry.npmjs.org/@raptorqr%2fraptorq-wasm/0.1.1)

The wrapper has an included MIT license, copyright 2026 Haixiang. The underlying
raptorq crate declares Apache-2.0. Preserve the MIT notice and the upstream
Apache license alongside staged files. The package manifest names raptorq 2.0.1,
but the source builder uses a Cargo semver range and publishes no Cargo.lock.
Its wasm-bindgen/js-sys inputs also use ranges. A reproducible binary/source
mapping has not been established. The measured binary is identified by its
exact hash. The build script is reviewed as text and is not executed here.
[Wrapper source and API](https://github.com/infrost/RaptorQR/tree/master/packages/raptorqr-raptorq-wasm),
[Rust crate](https://crates.io/crates/raptorq/2.0.1)

OSV exact-version queries for the npm package and declared crate returned zero
findings on 2026-11-15. Independent security audit of this artifact has not been
established. Its low-level decoder accepts allocation parameters and packet
headers. Production hostile-input assessment remains outstanding. The diagnostic
uses its own bounded public fixtures and generated packets.

## Experiment

Measure 200 KiB and 1 MiB fixtures with packet budgets of 512, 1024 and 1280 bytes,
including the codec's four-byte RFC payload ID. Generate 100% repair packets for
each case. Compare ordered reception, a late start dropping the first quarter
of generated packets followed by deterministic 20% loss, and duplicate reception.
Use eight trials per case, retain cold samples and verify full byte equality.
Measure encoding and decoding separately. Publish raw trials, median and p95.

These raw codec packets belong to the RFC 6330 interface. OpenMesh QR framing,
CRC, encrypted envelopes and final symbol/fountain thresholds remain pending.
The existing protocol format is preserved. A separate insufficient-subset case
checks that partial data produces an incomplete observation.

The browser diagnostic runs the synchronous WASM work in a dedicated worker.
The page can terminate that worker after a 120-second execution deadline and
reports initialization failure separately. This is diagnostic execution isolation.
It records WASM linear-memory size. Process memory, camera behavior and battery
require additional measurements.

## Verification

Write the codec and browser acceptance tests first. Check full equality,
incomplete outcomes, input budgets, packet sizes, duplicates, late/drop recovery,
worker completion after further HTTP is blocked, and unavailable initialization.
Free every decoder in finally. Publish measurements under docs/spikes and leave
phone, scanning and final threshold decisions explicit in the task report.
