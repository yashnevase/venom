# S-2 offline connection experiment

## Status

Browser diagnostic baseline implemented. Real offline-hotspot result pending.
The owner confirmed on 2026-11-14 that the page loaded in Chrome on the Xiaomi
Note 13 over the Mac's LAN server. That confirms page reachability only.

## Method

The standalone tool is in tools/spikes. It uses full SDP exchanged manually and
RTCPeerConnection with no STUN/TURN servers. It sends 4096 diagnostic bytes and
verifies the echo. The saved local JSON report includes browser, device notes,
ICE/connection events, elapsed time and the under-30-second target result.
No OpenMesh encryption or carrier implementation is included in the probe.

## Local results

Mac arm64, Chromium headless 159.0.8154.6, two isolated browser contexts.
P0 and Tag checks are separate from this experiment.

Both browser acceptance tests initially failed because the page was absent.
After implementation, S2-LOCAL and S2-INPUT passed, 2 tests in 1.1 seconds.
S2-LOCAL blocked HTTP after loading both pages, used no ICE servers, verified
4096 bytes in 366 ms including automated SDP exchange, then forcibly closed a
peer. Both endpoints reported closure. S2-INPUT rejected malformed JSON,
unknown diagnostic versions and input over 65536 characters.

An earlier trial using Playwright's browser-wide offline emulation failed ICE
connectivity. An HTTP-blocked trial retained the direct path and succeeded.
The difference suggests browser-wide offline emulation is unsuitable as the
sole model for a LAN with no WAN. Neither trial establishes phone behaviour.

## First phone attempt and regression fix

The owner supplied the Xiaomi's report. Its reduced user agent identified
Chrome 157.0.0.0 and a non-secure HTTP context. The real Android version is still
unknown. The offer was gathered in 224 ms. The diagnostic timeout fired at
246918 ms, with 0 bytes received, before the answer was applied. The corresponding
Mac answerer recorded ICE failure at 15184 ms, also with 0 bytes. Chat exchange
and the initial sandbox-related Mac launch delay occurred during this attempt.
Those observations do not isolate a network-level cause.

The harness originally counted manual exchange against its connection timeout.
S2-MANUAL reproduced that bug by advancing the browser clock 120001 ms before
an answer, and failed. After the fix, an offer remains pending through that
exchange window. Native ICE failure is recorded without immediately closing
the peer, leaving the diagnostic deadline to end the attempt. All 3 browser
checks then passed in 1.5 seconds on 2026-11-15. Phone retry is pending.

The raw measurement supplied by the owner is preserved in
`s2-xiaomi-note13-attempt-1.json`. It contains diagnostic metadata only.

## Phone procedure and remaining work

Follow tools/spikes/README.md. First record a Mac–Xiaomi LAN baseline. Then use
the phone's hotspot with mobile data off, and an offline SDP exchange method.
The chat-mediated baseline is distinct from the offline test. Save both reports.
Record the phone's exact Android version and Chrome version, hotspot settings,
elapsed time, success/failure, number of attempts and device pair direction.

Android–Android and Android–iPhone pairs remain unavailable. The QR/typed compact
handshake, real-phone camera behaviour and the full offline S-2 matrix remain
unverified. Production SC-10 carrier chaos remains a later-phase gate.
