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
the page foregrounded. After Complete, select the report and copy it into the
chat or save the text manually. JSON here is diagnostic data.

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
