# Claims ledger

| Claim | Test ID | Result | Conditions | Date | Status |
|---|---|---|---|---|---|
| Foundation tooling passes its local checks | P0-ACCEPTANCE, P0-SMOKE, L0 | 2 tests pass, strict types and lint pass, 135 installed package licenses checked, 0 advisory findings in 165 locked dependencies | Mac arm64, Node 24.11.0, pnpm 11.25.0, registry access for audit | 2026-11-14 | WORKS locally |
| GitHub CI passes the foundation gate | P0-CI | Run 43625101784 succeeded at commit 9bb267a | Ubuntu GitHub Actions | 2026-11-14 | WORKS |
| Offline WebRTC connects in under 30 seconds | S-2, DEV-2 | Pending phone test | Xiaomi Note 13 and Mac, hotspot with mobile data disabled | 2026-11-14 | UNPROVEN |
| Phase 1 seal/open and chunked conformance pass | T-UNIT-1..6, VEC-1..3 | Pending protocol decisions and implementation | Node, independent vector verifier, fuzz inputs | 2026-11-14 | UNPROVEN |
| Tags match the documented HMAC derivation and 64-counter window | VEC-TAG, T-UNIT-7, T-UNIT-8, T-TAG-LIMIT, T-TAG-CRYPTO | 6 tests passed, 8 Python vectors agreed, 256 Node HMAC comparisons agreed | Mac arm64, Node 24.11.0, 32-byte K_tag and u64 big-endian interpretation | 2026-11-14 | WORKS locally |
| The diagnostic verifies 4096 bytes and records peer closure | S2-LOCAL | 4096 bytes verified in 366 ms, then both endpoints reported closure | Two Chromium 159 headless contexts on one Mac, HTTP blocked, no ICE servers | 2026-11-14 | WORKS locally |
| Diagnostic handshake parsing rejects malformed, unknown-version and oversized input | S2-INPUT | 3 malformed-input cases passed | Chromium 159 headless, 65536-character cap | 2026-11-14 | WORKS locally |
| A diagnostic offer remains pending during manual handshake exchange | S2-MANUAL | Regression failed before fix, then passed with 120001 ms simulated browser-clock advance | Chromium 159 headless, simulated time, actual phone retry pending | 2026-11-15 | WORKS locally |
| The Mac–Xiaomi LAN diagnostic completes on the initial harness | S2-LAN-1 | First attempt received 0 bytes. Phone timed out at 246918 ms before answer application. Timer regression fixed afterwards. | Xiaomi Note 13 Chrome 157 reduced UA, Mac headless Chromium 159, existing LAN, chat-mediated SDP | 2026-11-15 | FAILS, first attempt retained |
| The corrected Mac–Xiaomi LAN diagnostic can complete | S2-LAN-2 | Both endpoints verified 4096 bytes on the second attempt. Mac 52841 ms from answer creation, phone 118941 ms from offer creation. | Xiaomi Note 13 and Mac, existing LAN, chat-mediated SDP | 2026-11-15 | WORKS once, LAN baseline only |
| Mac–Xiaomi diagnostic completes under 30 seconds | S2-LAN-2 | Mac 52841 ms and phone 118941 ms, including manual SDP exchange with distinct start events | Xiaomi Note 13 and Mac, existing LAN, chat-mediated SDP | 2026-11-15 | FAILS, target missed |
| Phase 1 implemented subset passes remote checks | P1-CI | Run 43627656726 succeeded at 3703e3e, including 3 browser tests | GitHub Actions Ubuntu, Tag subset and diagnostic harness | 2026-11-15 | WORKS, full Phase 1 gate pending |
| The six specified native crypto algorithms pass the capability probe on the pinned Node runtime | P1-CAP | 6 algorithm exercises and 2 acceptance tests passed, raw observation saved | Mac arm64, Node 24.11.0, ephemeral in-memory test keys, single-run timings | 2026-11-15 | WORKS locally, phone availability unverified |
