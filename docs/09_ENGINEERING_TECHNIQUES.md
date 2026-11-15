# 09 — Engineering Techniques (Doc 3, part 1 of 3)

Companion files: `10_TEST_STRATEGY.md` (how every claim is proven or disproven) and `11_DATA_MODEL_AND_ALGORITHMS.md` (schemas, pseudocode, sizes).
Status labels as before: DECIDED / TARGET / SPIKE / UNVERIFIED / LATER. New: **PROVEN-ELSEWHERE** = used in production by other systems; still must be proven in OUR code.

## 0. The principle
Torrent's revolution was one rule (downloaders also upload) plus verifiable pieces. Ours:
> **A message or file is a sealed object anyone can carry. Delivery is proven by the receiver, not promised by a server.**
The techniques below are small parts that make that rule work well. None is magic alone; the value is the combination, measured.

## 1. Correction: erasure coding is not always better than plain copies
Earlier I suggested erasure-coded helper shards as the answer to "strangers hold chunks without anyone holding too much". The math says it depends on how often helpers are online (p). Availability = chance that at least k of n holders are online. Computed with the binomial formula (script in `11`):

| Scheme (k of n) | Storage | p=0.3 | p=0.5 | p=0.8 | p=0.9 |
|---|---|---|---|---|---|
| 1 copy | 1x | 30% | 50% | 80% | 90% |
| 3 plain copies (1 of 3) | 3x | 65.7% | 87.5% | 99.2% | 99.9% |
| 6 of 10 | 1.67x | 4.7% | 37.7% | 96.7% | 99.8% |
| 6 of 12 | 2x | 11.8% | 61.3% | 99.6% | 99.99% |
| 8 of 16 | 2x | 7.4% | 59.8% | 99.85% | ~100% |
| 10 of 30 | 3x | 41.1% | 97.9% | ~100% | ~100% |

**Rules (DECIDED):**
- Few holders (<= 5) or unreliable holders (p <= 0.6, which is typical for phones and browser tabs): **store whole encrypted copies on 2–3 holders**. 3 plain copies at p=0.5 give 87.5%, while (3,6) coding at the same 2x-ish cost gives only 65.6%.
- Many reliable holders (>= 8 holders with p >= 0.8: desktop apps in the tray, station boxes): **use Reed-Solomon (k,n)** such as 8 of 16 for 99.85% at 2x storage.
- To reach 99% with k=6: p=0.9 needs n=9 (1.5x); p=0.8 needs n=12 (2x); p=0.5 needs n=22 (3.7x); p=0.3 needs n=40 (6.7x). **Unreliable holders make coding expensive.**
- p is a **measurement, not an assumption** (SPIKE S-9: log real holder uptime from the retention test group). Until measured, plan on plain copies.
- Repair: with copies, any surviving holder can seed a replacement; with coding, one node must collect k shards, rebuild, and re-encode (the Storj write-up notes this extra work and the need for hashes/signatures/retries in untrusted settings).

## 2. Adoption schedule
| # | Technique | Solves | Phase | Status |
|---|---|---|---|---|
| T1 | Content-addressed encrypted chunks + manifest | Anyone can hold/serve/verify without reading | 1–3 | PROVEN-ELSEWHERE |
| T2 | Helper placement (copies first, RS later) + rendezvous hashing | "Hosted for XYZ when XYZ comes online" | 7 (after gate B) | SPIKE |
| T3 | Proof-of-holding + durability meter | Honest "is my file safe?" | 7 | SPIKE |
| T4 | Hash-chained per-author logs + hybrid logical clock | Chat ordering, gap detection, no server clock | 4 | PROVEN-ELSEWHERE |
| T5 | Set reconciliation (Negentropy) | Cheap mailbox/feed sync | 4 or 8 | PROVEN-ELSEWHERE |
| T6 | Polite (delay-based) transfer pacing + Game mode | Downloads that don't lag games/calls | 3 | SPIKE (S-9b) |
| T7 | Piece selection: windowed, rarest-first, endgame | Fast multi-source download | 3, 8 | PROVEN-ELSEWHERE |
| T8 | Carrier scorer (Thompson sampling) | Pick the route that works per contact | 4 | PROVEN-ELSEWHERE |
| T9 | Quorum mailbox writes (write 3, need 2) | Unreliable public relays | 4 | PROVEN-ELSEWHERE (Dynamo-style) |
| T10 | Idempotent outbox (at-least-once + dedupe) | Reliable delivery without a server | 2–4 | PROVEN-ELSEWHERE |
| T11 | Compact SDP for QR handshake | Offline WebRTC with one small QR | 3 | SPIKE S-8 |
| T12 | Certificate by reference | Smaller messages | 4 | DECIDED |
| T13 | Poll privacy: decoy tags + jitter | Blur "someone is waiting" | LATER | SPIKE |
| T14 | Content-defined chunking | Re-send only edited parts of changing files | LATER (shared folders) | PROVEN-ELSEWHERE |
| T15 | Plumtree + HyParView gossip | Channel/radio broadcast | LATER (L1, L5) | PROVEN-ELSEWHERE |
| T16 | Fountain carousel for local notices | Late joiners on a hotspot/QR board | LATER | PROVEN-ELSEWHERE |
| T17 | Call bandwidth budget + Opus settings | Honest limits for gaming/voice | LATER (L7) | ESTIMATE |
| T18 | Capability delegation (Willow/Meadowcap-style) | Community permissions without an ACL server | LATER (L1) | WATCH |
| T19 | Quotas and eviction | "Your app uses too much storage" | 2 | DECIDED |
| T20 | Courier mode (social store-carry-forward) | Remote places | LATER (L4) | RESEARCH |

## 3. Catalog

### T1 Content-addressed encrypted chunks (DECIDED, Phase 1–3)
- docs/04 development revision 2 and ADR 011 define the exact T1 wire bytes. Deflate applies to the control body only. File streams use raw file bytes, independently of the final control header and signature.
- Generate a random per-file key and random stream_id before chunking. Use the owner's AES-256-GCM STREAM parameters, nonce = u88be(index) || final-byte and AAD = stream_id || u64be(index) || final-byte. Enforce the aggregate GCM budget and final-chunk rules in docs/04. External D-8 review gates public release and Gate E under AGENTS.md.
- `chunk_id = SHA-256(ciphertext chunk)`. The manifest lists ordered chunk ids, sizes, count, final index and stream parameters, and has its own sender signature. `file_id = SHA-256(canonical signed manifest)` is computed externally. The manifest omits file_id to avoid self-reference. The Box header commits to the manifest hash after the stream and manifest exist.
- Why: helpers store opaque chunks; any peer can verify a chunk without the key; downloads can come from many holders.
- Sizes: see `11` (verification chunk 64 KiB–1 MiB by file size; wire frame 16 KiB).
- Tests: T-UNIT-1..6, FUZZ-1, VEC-3.

### T2 Helper placement (SPIKE, Phase 7)
- Use the section 1 rules. Helpers are **opt-in friends/family/community nodes** with a visible size cap, never random strangers by default (legal and consent reasons, see `06`).
- **Rendezvous (highest-random-weight) hashing**: for each chunk group, `score(h) = SHA-256(group_id || helper_id)`; pick the top n helpers. Everyone computes the same list without coordination, and when a helper joins or leaves only the groups it ranked in move. Simpler than a DHT for small circles.
- Placement, uploads and repair are driven by the owner's device when online; a custodian may repair if it holds enough data.
- Tests: SC-4, SC-11, S-9.

### T3 Proof-of-holding and durability meter (SPIKE, Phase 7)
- At upload, the owner precomputes M challenges per shard: random byte ranges and expected `SHA-256(nonce || range bytes)`. Later, the owner (or anyone given a challenge) sends one; a helper that lost the data cannot answer. Each challenge is single-use.
- The meter shows: holders confirmed in the last 24 h / needed for 99% (computed from measured uptime). Wording: "Safe: 3 helpers hold it" or "At risk: only 1 helper reachable".
- Honest limit: the meter reports what was last confirmed, not a guarantee.
- Tests: SC-4, SEC-6.

### T4 Hash-chained per-author logs + hybrid logical clock (DECIDED, Phase 4)
- Each author keeps an append-only log per conversation: `{author, seq, prev_hash, hlc, deps[], body_hash, sig}`.
- `seq` and `prev_hash` give **gap detection** ("I have 1–7 and 9; ask for 8") and tamper evidence. `deps` (hashes of the latest messages the author had seen from others) gives causal order for replies.
- Display order: sort by `(hlc, author, seq)`, which is deterministic on every device.
- **Hybrid logical clock**: `l = max(l_local, l_msg, physical_now)`, with a counter to break ties. It survives wrong clocks better than raw timestamps and never goes backwards. Pseudocode in `11`.
- Tests: T-UNIT-9..12, SC-9.

### T5 Set reconciliation with Negentropy (PROVEN-ELSEWHERE, Phase 4/8)
- Checked: Negentropy sorts records by (timestamp, id), compares range fingerprints, splits only the differing ranges, and sends ID lists when ranges are small. JavaScript reference implementation exists; MIT licensed. Large or evenly spread differences can make messages big and add round trips, so apply a frame size limit and de-duplicate.
- Use for: "what does the relay/peer have that I don't" in mailboxes and community feeds. Not needed for a single file (use chunk bitmaps).
- Tests: T-UNIT-13, SC-2, SC-8.

### T6 Polite transfers and Game mode (SPIKE, Phase 3)
- Problem: a big upload must not raise latency for a game or call on the same connection.
- Method: **delay-based pacing** in the spirit of LEDBAT (the congestion control behind BitTorrent's uTP): measure RTT, track the minimum, treat the excess as queueing delay, and slow down when it passes a small target. I recall RFC 6817 capping the target at 100 ms, but I could not open the page, so UNVERIFIED.
- Browser limit: WebRTC data channels use the browser's own congestion control, which you cannot replace. You can only pace what you hand to it (watch `bufferedAmount`, send fewer bytes per tick). Native QUIC stacks allow custom controllers. So in the browser this is a **rate limiter driven by measured delay**, not a true LEDBAT.
- **Game mode toggle**: a manual switch that caps transfers to a small rate and pauses new uploads to others. Automatic game detection is LATER.
- Tests: S-9b, SC-5, device lab checklist.

### T7 Piece selection (PROVEN-ELSEWHERE, Phase 3/8)
- 1 peer: sequential. 2–4 peers: sequential with parallel requests. Bigger swarms: **rarest-first** (fetch pieces few peers have) plus **endgame** (ask several peers for the last pieces to avoid a slow tail). For video playback: a sliding window ahead of the playhead, rarest-first inside it.
- Tit-for-tat unchoking (a few upload slots plus one optimistic) only matters in larger swarms; skip until Phase 8.

### T8 Carrier scorer (PROVEN-ELSEWHERE, Phase 4)
- Per (contact, carrier) keep a Beta(α, β) success estimate and an EWMA latency. To choose: draw θ ~ Beta(α, β) per carrier and rank (**Thompson sampling**), so the app mostly uses what works while still occasionally trying others. Decay α, β by about 2% per day so it adapts when networks change.
- `reach` mode sends on the top 2 plus one exploration; `fast` on the top 1.
- It is plain statistics, not AI. LLMs have no role in the delivery path.
- Tests: T-UNIT-14, SC-3, SC-10.

### T9 Quorum mailbox writes (PROVEN-ELSEWHERE, Phase 4)
- Dynamo-style: publish each small box to N=3 relays chosen by relay score; mark **held** when W=2 acknowledge; read from R=2 relays plus one rotating one; dedupe by `box_id`.
- Relay score: publish success, latency, and measured retention (SPIKE S-3/S-10). Rotate away from relays that drop events.
- Tests: SC-3, SC-6.

### T10 Idempotent outbox (DECIDED, Phase 2–4)
- Kafka/Redis translated: the per-contact log is the durable ordered stream; `box_id` makes redelivery harmless (**at-least-once delivery + dedupe = exactly-once effect**); the outbox record is written to storage **before** any send; each device keeps its own read position (like a consumer offset), so multi-device works.
- State machine and retry policy in `11`.
- Tests: T-UNIT-15..18, SC-2, SC-10.

### T11 Compact SDP for the QR handshake (SPIKE S-8, Phase 3)
- A WebRTC data-channel offer is mostly boilerplate. The device-specific parts are about: ICE username fragment, ICE password, certificate fingerprint (32 bytes), role, and candidate addresses. Send only those (target about 100–300 bytes, one QR) and rebuild the full SDP on the other side.
- Risk: browsers produce slightly different SDP; Firefox/Safari quirks. Fallback: deflate the full SDP into 2–4 animated QR frames (fountain profile).
- Local candidates may appear as `.local` mDNS names that need multicast to resolve; some networks block that (S-2).

### T12 Certificate by reference (DECIDED, Phase 4)
- Attach the full sender certificate (about 100–200 bytes) only on first contact or on request; later messages carry a 16-byte hash. Saves roughly 15–20% on a 1 KB box and keeps Nostr events small.

### T13 Poll privacy (SPIKE, LATER)
- Poll a few random extra tags alongside real ones, add random delay jitter, and batch publishes. This blurs which tags are real; it does not hide your IP. Document the honest gain after measuring cost.

### T14 Content-defined chunking (LATER)
- For files that change (shared folders): choose chunk boundaries from a rolling hash (FastCDC/Rabin style, average 64 KiB) so an edit changes only nearby chunks. Not for v1 because encrypted, fixed chunks are simpler and files in v1 do not change.

### T15 Plumtree + HyParView gossip (LATER)
- Checked: Plumtree sends full messages along a lean "eager" tree and only IDs (IHAVE) along "lazy" links; a node that misses a payload sends GRAFT to fetch it and promote that link; PRUNE removes redundant eager links. It assumes an overlay like HyParView. I did not find typical view sizes; read the HyParView paper before choosing.
- For channels/radio/notices, a good fit. Not for chat.

### T16 Fountain carousel (LATER)
- A hotspot or QR "notice board" loops fountain symbols so late joiners rebuild after receiving any sufficient number. Works for a local announcement with no return path.

### T17 Voice/video budget (ESTIMATE, LATER)
- Mesh math: each participant uploads one stream per other participant. Voice (Opus around 24–40 kbps with silence suppression) for 8 players is about 7 x 32 = 224 kbps up: fine. Screen share at roughly 4 Mbps (varies widely) to 9 viewers is 36 Mbps up: not realistic at home. Video chat above about 4–6 people gets heavy.
- Rule for the UI: cap group video and screen share by measured upload speed and say why.

### T18 Capabilities (WATCH)
- Willow/Meadowcap-style: a signed chain "A allows B to write under prefix P until T" replaces an access-control server. Fits communities, but it is young. Our root->device certificates already cover the basic form. Revisit at Phase 8.

### T19 Quotas and eviction (DECIDED, Phase 2)
- Four classes with separate caps: personal data, subscribed content, cache, **helper-held (opt-in, default off)**. Evict cache first (LRU), then subscribed by age; never silently evict personal data. Defaults and UI in `11`.

### T20 Courier mode (RESEARCH, LATER)
- Boxes hop through family/friends' devices likely to meet in person (grandpa -> neighbour -> town). Needs the native Android app, opt-in, and a real field test. Do not promise it.

## 4. Do NOT use
Blockchain/tokens; LLMs in routing or encryption; convergent encryption (leaks file equality); a global DHT for everything; homegrown crypto constructions without review; automatic storage of strangers' data without consent.

## 5. Open research questions (answer by measuring)
1. Real holder uptime p for desktops, phones, browsers (S-9).
2. Will people opt in to hold chunks, at what cap?
3. Direct-connection success by network type (S-5).
4. Can delay-based pacing keep a game's ping low in browsers (S-9b)?
5. Public Nostr relay retention and limits (S-3, S-10).
6. Browser large-file ceiling on iPhone/Android (S-7).
7. Can one QR carry the compact handshake on all device pairs (S-8)?
