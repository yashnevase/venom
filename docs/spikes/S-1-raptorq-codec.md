# S-1 RaptorQ codec candidate measurement

Measured on 2026-11-15, Mac arm64, headless Chromium 159.0.8154.6, local HTTP
loopback. Node controller 24.11.0. Latest Mac source base e5502b3. The containing commit
identifies this experiment's code. ADR 010 records the dependency decision.

## Method

The diagnostic runs @raptorqr/raptorq-wasm 0.1.1 with its published binary and
JavaScript glue in a dedicated browser worker. The upstream manifest declares
raptorq 2.0.1. The supplied builder has semver ranges and lacks a Cargo.lock,
so its complete binary/source mapping remains unverified. Asset hashes identify
the measured artifact. npm package integrity is recorded in the raw report.

Two deterministic public fixtures, 204800 and 1048576 bytes, use packet budgets
of 512, 1024 and 1280 bytes. Each budget includes the four-byte RFC payload ID.
Symbols contain budget minus four data bytes. Each encode generates 100% repair
packets. Eight trials run for every size, budget and reception pattern, giving
18 cases and 144 round trips. All recorded trials verify full byte equality.

Ordered reception feeds systematic packets first. Late/drop reception skips the
first quarter of the generated list, drops every fifth remaining packet, then
reverses the retained list. Duplicate reception feeds each packet twice until
the decoder completes. Prepared subsets and byte equality are outside decode
timing. Unused repair packets after completion remain outside the decode loop.

Encoding time includes the synchronous WASM call, result validation and owned
packet copies. Decode time includes decoder construction, packet pushes, output
copy and cleanup. A finally block frees each decoder. Cold trials are retained.
Median averages the central pair. With eight trials, nearest-rank p95 is the
maximum. These are codec costs under the fixed workload.
Some sub-millisecond samples register as zero at the browser timer's resolution.

## Results

All 144 round trips verified. The controller observed zero further HTTP requests
after worker initialization. Codec WASM load/initialization took 2.400 ms in one
observation. This starts after static module imports and includes WASM fetch and
instantiation. It excludes initial page/JavaScript loading.

WASM linear memory was 1179648 bytes before the suite and 9830400 bytes after it.
These observations cover the WASM heap. JavaScript packet arrays, browser process
memory, camera memory and battery are unmeasured.

| Input bytes | Packet budget | Pattern | Encode median / p95 ms | Decode median / p95 ms | Generated packets | Delivered packets |
|---|---|---|---|---|---|---|
| 204800 | 512 | ordered | 2.550 / 7.200 | 0.150 / 0.600 | 808 | 404 |
| 204800 | 512 | late-drop | 2.050 / 2.200 | 1.700 / 1.800 | 808 | 404 |
| 204800 | 512 | duplicates | 2.000 / 2.200 | 0.150 / 0.200 | 808 | 807 |
| 204800 | 1024 | ordered | 1.800 / 2.200 | 0.100 / 0.200 | 402 | 201 |
| 204800 | 1024 | late-drop | 1.700 / 1.700 | 1.500 / 1.600 | 402 | 201 |
| 204800 | 1024 | duplicates | 1.700 / 1.700 | 0.100 / 0.200 | 402 | 401 |
| 204800 | 1280 | ordered | 1.500 / 1.500 | 0.100 / 0.100 | 322 | 161 |
| 204800 | 1280 | late-drop | 1.500 / 1.600 | 1.300 / 1.400 | 322 | 161 |
| 204800 | 1280 | duplicates | 1.400 / 1.500 | 0.100 / 0.200 | 322 | 321 |
| 1048576 | 512 | ordered | 12.100 / 12.800 | 0.600 / 0.900 | 4130 | 2065 |
| 1048576 | 512 | late-drop | 11.600 / 12.900 | 9.900 / 10.200 | 4130 | 2065 |
| 1048576 | 512 | duplicates | 11.850 / 12.800 | 0.850 / 1.000 | 4130 | 4129 |
| 1048576 | 1024 | ordered | 8.050 / 8.600 | 0.300 / 0.500 | 2058 | 1029 |
| 1048576 | 1024 | late-drop | 7.850 / 8.400 | 6.700 / 7.000 | 2058 | 1029 |
| 1048576 | 1024 | duplicates | 7.700 / 8.400 | 0.650 / 0.800 | 2058 | 2057 |
| 1048576 | 1280 | ordered | 7.100 / 7.800 | 0.350 / 0.500 | 1644 | 822 |
| 1048576 | 1280 | late-drop | 7.200 / 7.300 | 6.250 / 6.400 | 1644 | 822 |
| 1048576 | 1280 | duplicates | 7.100 / 7.300 | 0.600 / 0.700 | 1644 | 1643 |

## Asset and execution limits

The dependency's WASM and two JavaScript files total 209694 raw bytes. Node's
default per-file gzip bodies total 124233 bytes. The local server serves raw
files. The npm archive is 131962 bytes and its unpacked package is 231080 bytes.
The root dependency is development-only and declares zero npm dependencies.
License metadata and the inspected source are recorded in ADR 010. The declared
npm and Rust versions had zero OSV exact-version findings on the recorded date.
Independent audit and a reproducible locked Rust build remain outstanding.

The diagnostic caps fixture input at 1 MiB, packet budgets at 128–16384 bytes
and iterations at 16. The page exposes the fixed 18-case suite. It terminates
the worker after a 120-second execution deadline, ignores late worker messages
after stopping, and reports unavailable initialization separately. These limits
describe this diagnostic. Hostile network packets require production review.

The low-level RFC packets omit OpenMesh envelopes, QR framing and frame CRC.
The diagnostic exercises codec packets generated from its own public fixtures.
The Phase 1 signed/AEAD Box and full fountain vectors remain pending integration.

## Acceptance and verification

### Owner-supplied Xiaomi excerpt

On 2026-11-15 the owner replied to the Xiaomi Note 13, Android 16 benchmark
request. The pasted JSON ends inside the first trial of the sixth case. Five
complete cases contain 40 trials reporting full byte equality. The sixth case
has complete timing arrays and summaries, followed by an incomplete trial prefix.
All twelve supplied median/p95 pairs recompute from their timing arrays.

S-1-raptorq-xiaomi-partial.json preserves a normalized extraction. Repeated
non-timing fields from the five complete cases are grouped into shared fields.
It preserves the sixth case's visible prefix without filling missing trial
fields. The complete original report has been requested as a file attachment.

| Input bytes | Packet budget | Complete case | Encode median / p95 ms | Decode median / p95 ms |
|---|---|---|---|---|
| 204800 | 512 | ordered | 11.500 / 49.200 | 0.800 / 4.000 |
| 204800 | 512 | late-drop | 9.900 / 11.000 | 7.900 / 8.500 |
| 204800 | 512 | duplicates | 9.700 / 10.800 | 1.000 / 1.500 |
| 204800 | 1024 | ordered | 9.000 / 11.800 | 0.500 / 0.700 |
| 204800 | 1024 | late-drop | 8.150 / 8.300 | 7.050 / 7.100 |

The owner-supplied header reports initialization of 106.5 ms and WASM linear
memory of 1179648 bytes before and 9830400 bytes after the suite. The excerpt
omits browser/user-agent, build hashes, device notes, secure-context flag and
measurement time. Device attribution comes from the named-device request and
earlier owner-reported Android version. The 1 MiB results and 1280-byte packet
cases are absent. The full 18-case phone run and artifact provenance remain
unverified from this excerpt.

### Lossless report attachment

The first Save report button reused the S-2 detached-anchor Blob/download
pattern. The augmented S1-BROWSER acceptance first failed on the absent control,
then passed with exact downloaded/on-screen JSON equality. The owner subsequently
reported that tapping this button produced no file in Chrome Downloads on the
Xiaomi. That failed phone observation is retained as S1-EXPORT-PHONE-1.

The replacement is a visible native download link. The current Blob URL stays
alive while its report is current. Tapping it shows a download-request status.
The page-controller URL uses the export=2 revision and metadata fetch bypasses
cache. The native-link acceptance failed before replacement, then passed with
the expected Blob href, download filename, status text and exact file contents.
The owner has been asked to retry the explicit export=2 page on the phone.
The phone failure's exact cause and the replacement's phone behavior remain
unverified until that retry.

The Mac observation and its timing table were refreshed after the export-page
revision, preserving the six-asset evidence check. The codec and worker remain
the same measured implementation.

### Original codec acceptance

Codec acceptance first failed on the absent dependency and benchmark module.
Browser acceptance initially had a relative-URL harness error. After correcting
the URL, both tests failed on the absent page with HTTP 404. The implementation
then passed the codec and browser tests.

- S1-CODEC checks nine size/pattern combinations, two trials each, full equality,
  packet budgets, skipped packets and observed duplicates.
- S1-INCOMPLETE checks that a strict insufficient subset produces no completed
  decode in two trials.
- S1-EDGES checks exact lengths at 1, 123, 124, 125, 127, 128, 129 and 1048576 bytes.
- S1-BOUNDS checks invalid sizes, packet budgets and iteration counts.
- S1-REPORT checks six staged asset hashes and recomputes all timing summaries
  from the 144 recorded trials.
- S1-PHONE-PARTIAL checks the normalized excerpt, five complete cases, 40 matching
  trials, missing build metadata and all twelve supplied timing summaries.
- S1-BROWSER checks worker completion and matching JSON download after further HTTP is blocked.
- S1-UNAVAILABLE blocks the WASM asset and checks the initialization-failed result.
- S1-DEADLINE substitutes a non-completing worker, advances the page clock by
  120001 ms, and checks the timeout report and disabled run control.

## Task report

Task S-1 codec measurement. Phase 1 branch, early-spike scope. The containing
commit supplies the task commit identifier.

Tests run include six codec/evidence tests and three browser tests. The full
suite comprises one foundation test, 67 Vitest tests, 13 browser tests and
79 independent protocol vectors. Strict types, builds, lint and dependency
checks accompany the containing commit. Installed-license checks cover
139 package versions. The dependency audit reports zero known vulnerabilities.

Measured results include the timing table, 144 verified round trips, zero
post-initialization HTTP requests, 2.400 ms WASM initialization and the before/
after WASM heap values. Claims-ledger rows added use S1-CODEC/INCOMPLETE/EDGES/
BOUNDS, S1-BROWSER, S1-UNAVAILABLE/DEADLINE, S1-REPORT, S1-MAC and S-1/DEV-3.

Not verified on a real device includes Xiaomi's complete report and build metadata,
the replacement report-download link, older
Android, older iPhone, Safari, camera scanning, battery, total process memory,
real QR throughput and mid-stream scanning. S-1's final QR packet budget and
fountain threshold remain open. Phase 5 adoption, hostile-input handling and
full OpenMesh fountain conformance remain incomplete. D-8's external review and
the wire freeze remain outstanding. The owner's pending compression comparison
and deferred offline-hotspot test keep their existing status.
The Xiaomi excerpt is recorded above. A full downloaded report has been requested.

Files changed comprise the root development dependency/build script and lockfile,
the spike TypeScript configuration and README, ADR 010, this report, the raw Mac
report, docs/test-matrix.md, docs/claims-ledger.md, the benchmark, worker, page
controller and HTML, tools/raptorq.test.ts, tools/raptorq.browser.test.ts,
tools/stage-raptorq-spike.mjs, tools/run-raptorq-spike.mjs and the upstream notice.

The phone follow-up changes the normalized Xiaomi excerpt, this report, the Mac
observation, the two RaptorQ test files, the page controller and HTML, the module
README, claims ledger and device matrix. Its claim IDs are S1-PHONE-PARTIAL and
S1-EXPORT in addition to the refreshed S1-MAC observation. The task commit and CI
result are given in the follow-up handoff. S1-EXPORT-PHONE-1 retains the failed
phone export observation separately from the desktop acceptance result.

## Remaining goal audit

The preceding S-4 and S-6 goal turns made concrete experimental progress. This
S-1 turn adds a measured codec candidate and device-ready benchmark. The same
external review dependency remains present across all three turns. The owner
confirmed that the external review is unavailable. No reviewed revision or
review evidence has since been supplied in the conversation or repository.

Current core exports cover tags, deterministic CBOR, chunk sizing/hashes,
identity/certificates, native HPKE Base and the deflate candidate. The exported
API has no complete Box seal/open, Receipt or authenticated streaming Manifest.
The existing 79 independent vectors cover implemented components. Complete
small/chunked/fountain Box, receipt and stream conformance remain incomplete.
The Phase 1 gate therefore remains open. docs/05 requires subsequent phases
in order, and their acceptance paths depend on these missing operations.

ADR 008 records the required wire freeze and measured signed-field, size and
construction-order problems. Root AGENTS.md requires stopping before changing
that architecture. docs/04 D-8 separately requires a cryptographer's review of
the streaming construction and its OpenMesh integration. Approved implementation
direction is recorded in ADR 002. The missing input is the reviewed specification
and its review evidence for a named revision.

| Remaining experiment or gate | Current evidence | External prerequisite |
|---|---|---|
| S-1 target-device codec, scan, battery and threshold | Mac report and five complete owner-supplied Xiaomi cases | Full phone artifact metadata/report, older Android/iPhone and camera measurements |
| S-2 offline-hotspot handshake | LAN baseline recorded, target missed | Owner deferred the offline test, additional device pairs unavailable |
| S-3 sealed-box relay acceptance and retention | Complete sealed Box format pending | Reviewed Box encoding before its specified sealed-box experiment |
| S-4 complete saved-copy matrix | Mac observations recorded | Phone opening tests and Safari access |
| S-5 real-network/TURN success matrix | Existing LAN baseline only | Device operation on additional real networks and a usable TURN service |
| S-6 load spike | Seeded model and chart recorded | Gate C requires later real Carrier/Box integration |
| S-7 and S-8 mobile large-file and compact-handshake proof | Receiver/handshake integrations remain pending | Real devices, reviewed profile integration and the deferred offline lab |
| S-9, S-9b and S-10 longitudinal/user-network evidence | Application and later integrations remain pending | Working app, participating device operators and the specified observation periods |
| Phase 2 onward | Phase 1 gate incomplete | Reviewed core and preceding phase acceptance |

The next required implementation input is an exact revision covering the ADR
008 checklist with D-8 review evidence. The requested phone reports can supply
their measured results independently. There is no live review or device-test
job to monitor. The local static server serves the pending diagnostics.
