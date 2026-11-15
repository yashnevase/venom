# S-2 diagnostic harness

Build with `pnpm build:spike`. For a manual two-device run, serve the generated
files on the local network.

```sh
python3 -m http.server 8322 --bind 0.0.0.0 --directory tools/spikes
```

Open `http://localhost:8322` on the Mac and its LAN address on the phone. Load
both pages before disabling internet. Record model, OS, browser and network in
Device and network notes on both endpoints.

1. On the first device choose Create offer.
2. Manually transfer its Local handshake text to Remote handshake on the second
   device. Choose Create answer there.
3. Transfer the answer back to Remote handshake on the first device and choose
   Apply answer. Keep both pages foregrounded.
4. Save report on each device. Record any failure and each transfer attempt.
5. Close connection and confirm the remote endpoint records closure.

The diagnostic sends 4096 fixed bytes and verifies their echo. It uses the
browser's RTCPeerConnection with an empty ICE-server list. Handshake text is
limited to 65536 characters and event history to 128 entries. ICE gathering has
a 10-second timeout. The offer remains pending during manual exchange. A
120-second connection deadline starts when the offerer applies an answer, or
when the answerer finishes gathering its answer. The 30-second goal is recorded
separately from that deadline. Total timing includes manual handshake exchange.

The full-SDP JSON wrapper is diagnostic data. Protocol boxes use CBOR and await
the Phase 1 review. This harness tests a direct path, with a forced-close check.
Production multi-carrier failover is the Phase 3 SC-10 gate.

For the actual S-2 result use a hotspot with mobile data disabled, with an
offline method of transferring handshake text. Chat-mediated exchange is a
separate online baseline. QR encoding and compact SDP remain pending. Attach
the two saved reports and record results in `docs/test-matrix.md` and
`docs/spikes/S-2-offline-webrtc.md`.

Run automated browser checks with `pnpm test:browser` after building. Local
measurements and limits are in the spike record and claims ledger.

# D-2 compression diagnostic

Build with `pnpm build`, then use the same local static-server command above.
Open `/compression.html`. Enter device notes, choose Run benchmark and keep
the page foregrounded. After Complete, Save report downloads
`openmesh-d2-deflate.json`. Select report remains available for manual copying.
JSON here is diagnostic data.

The page imports staged copies of the compiled core compression module and
pako 3.0.3. Build metadata records the core commit and module SHA-256 values.
The staging script includes the Apache, MIT and zlib notices. Generated files
live under the ignored dist directory.

The diagnostic uses public fixture bytes. It records 16 trials per operation
for 1 KiB chat text, 256 KiB of repeated bytes and 256 KiB of seeded random bytes.
It checks every decode against the original, then checks rejection when the
repeated fixture exceeds a 16 KiB output allowance. Fixture creation, UI frame
yields, caller copies and equality checks are outside the timed codec calls.
Cold samples are retained. Median averages the two middle samples, and p95 is
the maximum with 16 samples. The JSON includes raw samples.

Native deflate/zstd constructor availability is recorded. This page measures
the current deflate candidate. D-2 still needs the browser/WASM zstd comparison.
The decoder executes synchronously. UI yields occur between trials. There is
zero automatic report upload. Copying the report is a manual action.

D2-BROWSER checks completion after subsequent HTTP is blocked, following initial
asset loading. D2-UNAVAILABLE checks the missing native-compressor result. These
are part of `pnpm test:browser`. Phone results belong in docs/spikes and the
real-device matrix.

## Deflate and zstd comparison

Open `/compression-compare.html` for the comparison. It loads the development-only
@bokuweb/zstd-wasm 0.0.27 browser modules and WASM before enabling Run benchmark.
Level 3, the same three fixtures, 16 trials and the same timing boundaries are
used. The report has 12 timing summaries and 192 timed calls. Every decode is
compared with its fixture. The existing deflate expansion-limit check also runs.

The zstd path receives fixed public fixtures and its own generated frames. Its
wrapper's frame-sized allocation needs a separate hostile-input assessment before
production adoption. ADR 007 records source, size, licensing and review status.
The staged import map resolves the package's extensionless browser imports.
WASM initialization has a 15-second diagnostic deadline.

After the comparison finishes, Save report downloads `openmesh-d2-comparison.json`.
Both pages use a visible native link and retain the current Blob URL until the
next report is published. The request status points to browser Downloads. The
export=2 page/controller URLs refresh this diagnostic revision, and metadata is
fetched without cache. Build metadata also records SHA-256 for the diagnostic
controller and shared core configuration.

The report includes JavaScript import and WASM initialization time. Those are
single observations including asset loading and execution. It also records WASM
linear-memory bytes before/after the trials. This memory measure covers the
WASM heap. Browser process memory and battery require separate observations.
Build metadata gives raw asset sizes, per-file gzip body sizes and hashes.
The local Python server serves raw files.

D2-COMPARE blocks further HTTP after initialization and checks codec completion
plus two-way interoperability against Node's native zstd API. D2-WASM-UNAVAILABLE
checks initialization failure. Run them with `pnpm test:browser` after `pnpm build`.
All four compression browser tests compare the downloaded JSON with the exact
on-screen result, including the unavailable-runtime reports.

For the isolated resource assessment, run `node tools/run-zstd-allocation-probe.mjs`
with the port 8322 static server running. It loads the initialized browser codec,
temporarily guards allocator requests above 1 MiB, and submits a 12-byte fixture
declaring 32 MiB. The large allocation is blocked before execution. The helper
restores the allocator, reclaims its small source allocation and checks a control
round trip. It saves phase-1-zstd-allocation-review.json under docs/spikes.
D2-ZSTD-ALLOCATION replays the observation and checks the three artifact hashes.
ADR 007 records scope, interpretation and production-adoption requirements.

# Box draft review evidence

After `pnpm build`, run `node tools/spikes/box-transcript-review.mjs` to reproduce
the literal-transcript and size-accounting observations in ADR 008. The script
uses the public identity fixture and writes docs/spikes/phase-1-box-draft-review.json.
It checks whether changed draft-shaped kind/attachments fields alter the literal
signed transcript, finds a signature-placeholder compression boundary, and
measures primitive envelope components. The integrated Box codec is pending its
wire freeze. The evidence is for that review.

# S-4 saved-copy diagnostic

Run `pnpm build`, then open `tools/spikes/dist/saved-copy.html` from the local
filesystem. The generated HTML includes its script and Apache license. The
adjacent `saved-copy.sha256` contains the SHA-256 of the complete HTML artifact.
Run checks, reload the page, and run again to observe the previous scratch
token. Remove test data deletes the diagnostic's IndexedDB database. Select
report selects the JSON for manual copying. Keys are ephemeral test keys.

`pnpm test:browser` runs S4-FILE, S4-DENIAL and S4-INDEPENDENT in isolated
Chromium contexts. `pnpm test` runs S4-HASH-BUILD, which compares the artifact
digest and changes a title byte sequence to check that its digest differs.
The digest comparison runs outside the HTML page. A trusted signed release
hash list and an app-visible copy-verification workflow remain pending.

On a Mac with Chrome installed, run `node tools/run-saved-copy-spike.mjs` after
building. This uses temporary profiles in bundled Chromium and installed Chrome,
requests the browser sandbox, sets the contexts offline, and records reload,
renamed-copy, different-directory and browser-restart observations. It closes the
browsers and removes its temporary profiles. Results overwrite
`docs/spikes/S-4-mac-observations.json`. These observations use headless browsers.
The S-4 report records device gaps and the provisional saved-copy UX decision.

# S-1 RaptorQ codec diagnostic

Build with `pnpm build`, then use the local static server above and open
`/raptorq.html`. Run benchmark measures fixed 200 KiB and 1 MiB public fixtures
in a dedicated worker. Enter device notes before starting. Select report
selects the resulting JSON for manual copying. Save report downloads the same
JSON as `openmesh-s1-raptorq.json` through a native download link for attachment.
The link displays a request status after tapping. The current Blob URL stays
available until another report replaces it. Eight
trials run per packet size and reception pattern.

The packet budgets are 512, 1024 and 1280 bytes, including the four-byte RFC 6330
payload ID. Each encode creates 100% repair packets. Ordered, late/drop and
duplicate reception each verify complete byte equality. Late/drop skips the
first quarter of generated packets, drops every fifth remaining packet, then
reverses the retained order. Packet preparation and byte equality sit outside
timed decoding. Encoding includes validation and owned packet copies. Decoding
includes constructor, packet pushes, output copy and decoder cleanup.

The worker records WASM load/initialization time and linear-memory bytes before
and after the full suite. The page enforces a 15-second initialization deadline
and a 120-second benchmark deadline. A timeout terminates the worker. Reload the
page to retry after initialization failure or timeout. The staged build file
records dependency versions, npm integrity, source-base commit, byte sizes and
asset hashes. MIT and upstream Apache notices accompany the files.

Run `pnpm exec vitest run tools/raptorq.test.ts` for the seven codec/evidence tests
and `pnpm exec playwright test tools/raptorq.browser.test.ts` for the three worker
tests. The browser suite checks completion and exact JSON download after subsequent HTTP is blocked,
unavailable WASM and a simulated non-completing worker deadline. With the port
8322 static server running, `node tools/run-raptorq-spike.mjs` saves a fresh Mac
observation under docs/spikes. The evidence test compares its asset hashes and
recomputes timing summaries.

ADR 010 and S-1-raptorq-codec.md record adoption scope and measurements. Camera
scanning, battery, mobile performance, production input handling, QR framing and
the final fountain threshold require the remaining experiments.
