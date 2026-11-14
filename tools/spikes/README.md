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
