# 10 — Test Strategy (Doc 3, part 2 of 3)

Goal: for every promise, know whether it WORKS, FAILS, or is UNPROVEN, with a number, a device, and a date. Nothing is announced without a test.

## 1. The claim ledger (the most important file)
Create `/docs/claims-ledger.md`. Every sentence you might say to users or put in a README becomes a row. A claim with no row cannot be published.

| Claim | Test ID | Result | Conditions (device, network, size) | Date | Status |
|---|---|---|---|---|---|
| "Messages arrive even if the other person was offline" | SC-2, E2E-3 | e.g. 98% within 10 s of recipient coming online | 3 public relays, Android+Mac | | WORKS / FAILS / UNPROVEN |
| "Works with no internet via QR" | S-2, S-8, DEV-2 | | each device pair | | |
| "Large files resume after a drop" | SC-5, E2E-2 | | 500 MB, 5% loss | | |
| "Your file stays available if you go offline" | SC-4, S-9 | | with 3 helpers | | |
Rules: results come from the test, never from memory; re-run before each release; a FAILS row stays visible and the claim is rewritten or dropped.

## 2. Test levels (cheapest first; each must pass before the next matters)
**L0 Static checks (every commit):** TypeScript strict, lint, dependency license check, `npm audit`, bundle-size budget (TARGET: first load as small as you can; fail CI if it grows more than 10% without an ADR).

**L1 Unit and property tests (every commit):** Vitest plus property-based testing (fast-check style). Required properties:
- T-UNIT-1: seal then open returns the original for random payloads of random sizes (0 B to 5 MB).
- T-UNIT-2: any single flipped bit in a box makes `open` fail, never return wrong data.
- T-UNIT-3: wrong recipient key fails safely.
- T-UNIT-4: chunk reordering, dropping, truncation, duplication are all detected.
- T-UNIT-5: manifest verification rejects any changed chunk id.
- T-UNIT-6: padding always lands in a bucket size; plaintext length not recoverable from ciphertext length beyond the bucket.
- T-UNIT-7: tags depend only on (K_tag, counter), not on time.
- T-UNIT-8: tag window: receiver with a gap up to W-1 still finds the box; at W it triggers resync.
- T-UNIT-9..12: log chain: gap detection, forged prev_hash rejected, HLC never decreases, deterministic order on all permutations of arrival.
- T-UNIT-13: reconciliation: two random sets end identical after sync; bytes grow with the size of the difference, not the set.
- T-UNIT-14: scorer prefers the better carrier after N trials and recovers after a carrier heals (statistical test with fixed seed).
- T-UNIT-15..18: outbox: idempotent redelivery, crash between steps never loses or duplicates a message, backoff bounds, TTL expiry.
- T-UNIT-19: erasure/replication: any k of n shards rebuild (property); fewer than k never "succeeds".
- T-UNIT-20: availability calculator matches the binomial formula.

**L2 Golden vectors (every commit):** JSON vectors in `packages/test-vectors` (see `04`, section 9). Add a **second, independent verifier** (a ~200-line Python script written from the spec alone, not from the TypeScript code). If the two disagree, the spec is ambiguous: fix the spec. This is the cheapest proof that the protocol is real.

**L3 Fuzzing (nightly):** random, truncated, oversized, deeply nested and malformed inputs into every parser (box header, manifest, CBOR, log record, QR frame, SDP). Pass: no crash, no hang over 1 s, memory stays under a cap, error is a typed result.

**L4 Deterministic simulation (every PR; the heart of confidence):**
`packages/sim` runs virtual nodes with virtual time, seeded randomness, configurable latency, loss, churn, NAT-blocked pairs, relay failures, and holder uptime. Every failure prints its seed so it can be replayed exactly.
| ID | Scenario | Pass criterion (TARGET) |
|---|---|---|
| SC-1 | A to B, both online, direct possible, 1 MB | time-to-deliver p95 under 5 s |
| SC-2 | B offline 1 h, 4 KB message via relays | delivered within 10 s of B reconnecting; no duplicate shown |
| SC-3 | 3 relays: one down, one drops 30% | delivery at least 99% over 1,000 messages |
| SC-4 | 500 MB file, sender goes offline after seeding to 3 helpers (p = 0.5 and 0.8) | measured availability within 3 points of the model in `09` section 1 |
| SC-5 | 500 MB file, 5% loss, 100 ms RTT, 3 forced disconnects | completes, hash verifies, extra bytes under 10% |
| SC-6 | Malicious relay: replay, duplicate, reorder, flood | no duplicate display, no crash, memory bounded |
| SC-7 | Malicious peer sends bad chunks | rejected, peer scored down, transfer completes from others |
| SC-8 | 50 / 500 / 1,000 downloaders, one web seed, churn (S-6) | median and p95 time do NOT grow linearly with clients; report seed bandwidth |
| SC-9 | Clock skew of plus or minus 1 day on one side | tags still match; log order unchanged |
| SC-10 | Carrier chaos: kill random carriers, including WebRTC entirely | box still arrives through any surviving path |
| SC-11 | Helper quota reached | helper refuses politely; eviction order correct; owner informed |
| SC-12 | Recovery: restore from phrase on a new device | can read new messages and old ones present in the backup; nothing else |

**L5 Real-stack tests in browsers (nightly):** Playwright with two browser contexts talking over real WebRTC and a local test relay. Add network shaping (Chrome DevTools throttling, or `tc netem` on Linux CI). Allow limited retries for flaky WebRTC, but record the flake rate: it is itself a measurement.
- E2E-1: identity -> export -> import on a second profile with the network off.
- E2E-2: 200 MB file, kill the connection, resume.
- E2E-3: message sent while the receiver is closed; receiver opens later and gets it plus a receipt returns.

**L6 Real-device lab (before every release and before Gate A):**
Devices: Mac (Safari and Chrome), Windows laptop, one older Android (3+ years), one recent Android, one iPhone. Networks: home Wi-Fi, phone hotspot with no data, mobile data only, a restrictive network (hostel/office) if available.
- DEV-1: Phase 2 acceptance test on each device.
- DEV-2: offline QR handshake for every device pair (S-2, S-8).
- DEV-3: QR fountain: 200 KB, airplane mode, start mid-stream; log frames per second, scan success rate, total time.
- DEV-4: battery: 30 minutes of transfer and 1 hour idle with the app open; record percent drop.
- DEV-5: memory: 1 GB file receive on Android and iPhone browsers (S-7).
- DEV-6: Safari: install to Home Screen, confirm data survives a week of non-use vs not installed (compare).
Record in `/docs/test-matrix.md`: device, OS, browser, network, result, notes.

**L7 Soak (before Phase 6 ends):** desktop app in the tray for 24 hours with a message every minute and a file every hour. Watch memory growth, open connections, storage growth, CPU. Pass: no growth trend, no crash.

**L8 Security and privacy tests:**
- SEC-1: tamper tests (modify header, manifest, chunk, signature, certificate) all rejected.
- SEC-2: replay old valid boxes and receipts: ignored, no state change.
- SEC-3: wrong-recipient and revoked-device tests.
- SEC-4: relay observer test: log everything a malicious relay sees across 1,000 messages; assert no plaintext, no stable sender identifier, no fixed tag reused, sizes only in buckets.
- SEC-5: resource exhaustion: huge declared sizes, many tiny chunks, many open connections: capped.
- SEC-6: fake holder claims data it deleted: proof-of-holding challenge fails it.
- SEC-7: saved-copy integrity: modified app copy shows a different fingerprint (S-4).
- Before real safety claims: independent review of the protocol and crypto construction by a cryptographer.

**L9 Human tests:**
- Retention test: 10 heavy file-sharers; record first use, second use within 7 days unreminded (yes/no), what they sent, what confused them.
- Task tests with 5 new people, no help: create identity, add a contact by QR, send a file, restore from backup. Record time and where they stop.
- Success targets (TARGET): at least 7 of 10 do the second use; at least 4 of 5 finish all tasks unaided.

## 3. Spikes added in Doc 3 (in addition to S-1..S-6 in `05`)
| ID | Question | Pass condition |
|---|---|---|
| S-7 | Large file receive in browsers: write chunks to the browser's origin private file system, then hand the file to the user. How big on iPhone/Android before failure? | Largest reliable size per device, and the fallback message shown above it. Check Safari behaviour; support details UNVERIFIED |
| S-8 | One-QR compact WebRTC handshake (T11) on all device pairs | Connects in under 30 s, or documented fallback to animated QR |
| S-9 | Holder uptime: log online time of retention-test users' desktop and phone apps over 2 weeks | Measured p per device type |
| S-9b | Delay-based pacing in a browser while a game or call runs | Added latency under 30 ms at the target rate (TARGET) |
| S-10 | Relay quorum: success and retention across 5+ relays over 7 days | Table of relay reliability; quorum policy chosen |

## 4. Release gates
- **Gate A (technical):** L0–L3 green; SC-1, SC-2, SC-10 pass in simulation; E2E-1 and DEV-1 pass on the full device list.
- **Gate B (product):** retention test result recorded.
- **Gate C (load):** SC-8 holds with real code.
- **Gate D (before any helper feature):** S-9 measured; SC-4 matches model; legal advice taken on holding others' encrypted data (`06`).
- **Gate E (before any "private/secure" marketing):** SEC-1..7 pass and independent cryptographic review done.

## 5. Report format (what the AI hands back after every task)
```
Task: <name>   Phase: <n>   Commit: <hash>
Tests run: <ids, pass/fail counts>
Measured: <numbers with units, device, network>
Not verified on a real device: <list>
Claims ledger rows added/changed: <list>
Known problems: <list>
```
