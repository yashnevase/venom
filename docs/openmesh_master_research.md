# OPENMESH — Master Research Consolidation & Build Blueprint
**Version 1.0 · Consolidated from six research documents and iterative architecture reviews (2025–2026)**

---

## 0. How to read this document

This is the single source of truth for the OpenMesh project. It merges an original technical blueprint, a delay-tolerant networking (DTN) research pass, three rounds of adversarial architecture review, and a product-strategy review. Everything here falls into one of four categories:

- **[LOCKED]** — agreed after debate. Do not reopen without new evidence.
- **[USEFUL]** — research findings, case studies, and prior art that ground the design.
- **[DEFERRED]** — validated as valuable, but explicitly not in v1.
- **[DO NOT BUILD]** — ideas considered and rejected, with reasons.

If you are a new contributor, read Sections 1–3 and 16. If you are an engineer, read the whole thing.

---

## 1. The Vision

Build communication and knowledge infrastructure that ordinary people can use, host, modify, and extend **without asking permission from any corporation, government, or infrastructure provider** — and that keeps working when connectivity is slow, censored, expensive, or gone entirely.

The project is deliberately **not** "another Reddit/Telegram." Those are apps. This is infrastructure: a protocol, an engine, and products on top. The ambition, stated in one line:

> **The Box, the Tag, and the Receipt** — sealed information that travels over any road that is legitimately available, readable only by its intended recipient, provably delivered — with no server the builder operates.

The deeper goal, stated honestly: build something so lean and so effective under bad conditions that it spreads on its own merits (like BitTorrent and Telegram did), earns the builder credit as its engineer, and **cannot be owned, bought, or shut down** — by anyone, including the builder.

---

## 2. Hard Constraints (these shape everything)

| # | Constraint | Consequence |
|---|---|---|
| C1 | The builder can deploy a **static frontend only** (e.g., Vercel). No backend, no database server, no paid storage. | The architecture must be local-first and peer-to-peer *by necessity*. Any design needing a server is disqualified. |
| C2 | **Credit without control.** The builder wants to be remembered as the engineer, not the operator. | Governance must separate the unownable protocol from the attributable implementation (Section 10). |
| C3 | **Spread on merit.** Adoption must come from doing a job better than incumbents — not from ideology words. | Every feature must pass the one-sentence test: explain the benefit without saying "peer-to-peer," "Tor," "torrent," or "decentralized" (Section 11). |
| C4 | **Safe and honest by design.** No bypassing carrier access controls, no secretly using networks that forbid it, no "untraceable" promises. | Privacy is engineered (encryption, metadata minimization) and *labeled honestly* ("hard to trace," never "untraceable"). |

---

## 3. Locked Architecture Decisions [LOCKED]

These survived multiple rounds of critique and are the project's constitution.

### 3.1 The core primitive: Box, Tag, Receipt

The entire system is three primitives. Everything else is a carrier, a policy, or a UI.

- **THE BOX** — a message or file, encoded as fountain-coded, fixed-size, padded, encrypted, signed chunks, with a manifest (content hash / Merkle tree) for per-chunk verification from untrusted sources.
- **THE TAG** — a rotating HMAC (`HMAC(shared-secret, time-window)`) that lets the intended recipient recognize their box on a carrier without the carrier learning who talks to whom. First contact bootstraps the shared secret via a link, QR code, or typed code.
- **THE RECEIPT** — a signed proof of delivery that travels back to the sender through any carrier, with no central server.

The network layer has no other concepts. This replaces the earlier "VENOM routing engine" and the Bundle Protocol core (see 3.4).

### 3.2 Dumb carriers, smart endpoints

The end-to-end principle, applied ruthlessly:

- **Carriers are dumb.** They hold and move opaque, fixed-size boxes. They never read, route intelligently, or know sender/recipient. Every transport implements the same tiny interface:

```
Carrier {
  put(box)                       // send
  poll(tags[]) -> boxes[]        // receive only boxes matching my tags
  caps { direction, mtu, latency, cost, risk }
}
```

- **Endpoints are smart.** The sender's and receiver's devices do all thinking: which carriers to use, when, how to recognize their boxes, how to reassemble.

### 3.3 Fountain-coded chunk transport [LOCKED — the "marvel"]

RaptorQ fountain codes: a file becomes a stream of encoded chunks; a receiver rebuilds it from **any sufficient subset** — no acknowledgments, no ordering, no return path. This is the single most important technical choice, because it works exactly where chat apps fail: one-way satellite downlinks, QR streams between air-gapped phones, interrupted Bluetooth, half-dead links.

- Chunks are **fixed-size, compressed (zstd), padded, and encrypted** — uniform size is both a correctness property and a privacy property.
- Combined with **(k,n) threshold secret sharing**, no single carrier ever holds enough shards to reconstruct anything. *(Validated as powerful; **DEFERRED** to a post-v1 chapter — see 3.7 and Section 15.)*
- Per-chunk content hashing (SHA-256, Merkle manifest) means **untrusted relays cannot corrupt or fake content** — you verify each chunk as it arrives.

### 3.4 DTN is a fallback adapter, not the engine [LOCKED — reverses the original design]

The original blueprint made Bundle Protocol v7 (RFC 9171) the routing core ("VENOM"). The review reversed this, correctly:

- **Classic DTN assumes sparse, predictable mobility** (deep space, disaster zones). A social network is dense, bursty, and socially clustered — the worst case for DTN routing tables.
- **Bundle Protocol v7 and RFC 9172 (BPsec) remain required reading** and a *convergence-layer adapter* for multi-day disconnected or radio hops — not the core.
- The default fabric for any IP path is **WebRTC peer connections** (Trystero — see 5.1), with file export/import as the zero-infrastructure fallback.

> Formally: *VENOM doesn't route through DTN. It falls back to DTN.*

### 3.5 Two node classes [LOCKED]

- **Ephemeral clients** (browsers): can send, receive, cache recent content. **Never forward third-party boxes.** Browsers are terrible custodians (tab suspension, storage eviction, no reliable background execution) — this is a *design contract*, stated honestly to users, not an embarrassment.
- **Full custodians** (Android/desktop/community nodes): hold boxes indefinitely, participate in long-term forwarding.

### 3.6 Identity: local keys, no accounts [LOCKED]

- Ed25519 keypairs generated locally in the browser via **WebCrypto** — no library dependency, no accounts, no phone numbers.
- **Root key → signs device keys → device keys sign posts.** Device keys are revocable without losing the root identity (the Fireweed model). Peers verify the full certificate chain locally.
- The networking identity and the social identity are **separate**. A user can hold multiple community-specific pseudonyms.
- No private key ever leaves the device; optional encrypted backup/recovery.

### 3.7 Scope discipline [LOCKED — the BitChat lesson]

BitChat (permissionlesstech/bitchat) reached 35,000+ GitHub stars with **521 Swift files, one external dependency, and the Unlicense** — and was installed tens of thousands of times *per day* during Nepal's 2025 blackout and Iran's 2026 shutdown. The lesson isn't "build Bluetooth mesh." The lesson is: **small dependency budget + public-domain dedication + one job done well = infrastructure people trust in a crisis.**

Therefore v1 ships **only**:

1. Box/Tag/Receipt core with fountain-coded chunks
2. Three carriers: **file/QR/share-sheet (offline), WebRTC (live), Nostr relays (internet)**
3. One wedge product (Section 11)
4. E2EE by default (encryption and signing — kept from the very first blueprint)

Everything else is deferred or rejected (Sections 14–15).

---

## 4. The Full Architecture (as locked)

```
┌──────────────────────────────────────────────────────────┐
│  STATIC FRONTEND (Vercel) — the app, and also a relay    │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Product layer: Send → Shared Folders → Communities  ││
│  ├──────────────────────────────────────────────────────┤│
│  │  Box / Tag / Receipt (Ed25519, RaptorQ chunks)     ││
│  ├──────────────────────────────────────────────────────┤│
│  │  Multi-carrier scheduler (fast / reach / quiet)    ││
│  │  dedupe · score · backoff · parallel send          ││
│  ├──────────────────────────────────────────────────────┤│
│  │  Carriers (uniform interface, dumb pipes):         ││
│  │  file · QR · share sheet · WebRTC · Nostr · ...   ││
│  ├──────────────────────────────────────────────────────┤│
│  │  Local store: IndexedDB + encrypted key storage    ││
│  │  (Yjs/CRDT for multi-writer shared state)          ││
│  └──────────────────────────────────────────────────────┘│
└───────────────────────┬──────────────────────────────────┘
            carriers are other people's roads:
        Nostr relays · WebRTC peers · files/QR · DHT ·
        user's own email/drive · (later) satellite, radio
```

---

## 5. Carriers — the transport layer [LOCKED list, prioritized]

Priority order for implementation. Each is one adapter against the Carrier interface; adding one is ~a day of work once the core exists.

| # | Carrier | Direction | Notes |
|---|---|---|---|
| 1 | **File / QR stream / OS share sheet** | both | The zero-infrastructure fallback and the independence guarantee. QR stream works in airplane mode; receiver can start mid-stream thanks to fountain codes. |
| 2 | **WebRTC (Trystero)** | both | Live mode. Zero backend: signaling via Nostr (default), BitTorrent tracker, MQTT, or self-hosted WebSocket — swappable strategies, same API. |
| 3 | **Nostr relays** | both | Open-by-design public relays; easiest internet carrier from a browser. Spam-controlled with blind-signed postage (9.2). |
| 4 | **User's own accounts** (email via Delta Chat pattern, own cloud-drive links) | both | Legitimate, durable, unbannable-by-us; the user brings their own road. |
| 5 | **Mainline DHT (BitTorrent)** | both | 10M+ nodes, 15 years of uptime; ~1000-byte records with hours TTL (republish loop). Good for small tagged boxes/pointers; browsers need an HTTP relay. Pkarr proves the pattern. |
| 6 | **Tor / Snowflake wrappers** | both | Wrap any IP carrier for sensitive modes. Snowflake model: **visitors to the static page become one-hop relays** — the frontend doubles as the relay pool, solving relay supply with zero hosting. |
| 7 | **Receive-only broadcast** (satellite downlink — e.g., Blockstream Satellite, ~$100 kit, free one-way, public-key encrypted content) | receive | One-to-many with no return path — exactly what fountain codes are for. *(Deferred — hardware.)* |
| 8 | **Local Wi-Fi / hotspot + BLE** | both | Browser WebRTC over a shared hotspot works today (needs real-device testing). True phone-to-phone with no network needs a native wrapper (Capacitor, later). |

**Scheduler policy modes:** `fast` (one live carrier), `reach` (everything available, parallel), `quiet` (few carriers, low profile). The chaos-test demo (Section 16) is the proof: randomly kill carriers mid-transfer; the box still arrives through whichever survive.

---

## 6. Data, Storage & Synchronization

### 6.1 Local-first is the foundation, not a feature [LOCKED]

The seven ideals (Ink & Switch): fast (no network round-trips), multi-device, offline-capable, collaborative, long-lived, private by default, user-owned. **The local database is the source of truth; the network is an optimization.** The feed renders from IndexedDB before any network call exists.

### 6.2 Storage strategy

- **Browser:** IndexedDB with schema versioning, indexed lookups, bounded caches, explicit quota management, recovery from eviction, export/import.
- **Native (later):** SQLite via a Capacitor wrapper sharing the same protocol.
- **Four storage categories** (not every device stores everything): personal data, subscribed data, cached public data, archived public data (dedicated custodians).
- **JSON only for human-readable export.** Production wire encoding: compact deterministic CBOR or binary chunks. Never JSON files as a primary database.

### 6.3 Multi-writer state: CRDTs [LOCKED choice]

- **Yjs** as the v1 default: ~260k ops/sec apply rate, 1.2–1.6× size overhead, mature ecosystem (`y-indexeddb`, `y-webrtc`), ~920k weekly downloads.
- Alternatives measured: Automerge 2.0 (full-history DAG, ~30% overhead, larger bundle), Loro (fastest raw benchmarks, younger ecosystem). Switch only with a measured reason.

### 6.4 Signed, immutable event records [kept from original blueprint]

- Public contributions are **signed, immutable records** with content hashes; edits and deletions are new signed events (deletion = tombstone + local removal; no false promise of global erasure).
- Per-author event sequences; no global ordering (avoids coordination collapse).
- Synchronization = exchange bounded **inventory summaries** → request missing records → verify hash + signature → store. Never dump millions of hashes.

### 6.5 Social-topology-aware replication [USEFUL → v2 direction]

Opportunistic-networking research (2024–2026) converged: **epidemic flooding dies under load; community structure is the routing table.** HCAR-style community-aware forwarding shows double-digit gains in delivery ratio with lower overhead. Concrete design: peers exchange a signed **community-carrier advertisement** ("which communities am I a carrier for?") and route boxes along community overlap, not hop count. A node subscribed to 50 communities becomes a natural hub; a 2-community node is a leaf.

---

## 7. Identity & Security Model (summary)

- **Signing:** Ed25519 (WebCrypto). **Encryption:** separate keys — never reuse signing keys for encryption.
- **Chain:** root key → device keys → records. Device revocation via root-signed tombstones.
- **Group messaging (later):** audited MLS implementation (RFC 9420) — never homegrown crypto.
- **Established primitives only** (NaCl/libsodium-family, AES-GCM, HKDF, HMAC tags, RaptorQ, SHA-256/Merkle). No custom cryptography, ever.
- **Untrusted-relay verification:** every chunk hash-checked; every record signature-checked; every identity chain-verified — a malicious peer can only *withhold*, never *forge*.
- **Privacy rule from the original blueprint:** never reuse one global identity across every community by default; pseudonyms per community, linkable only by explicit user action.

---

## 8. Privacy & Threat Model — stated honestly [LOCKED]

| Threat | Protection |
|---|---|
| Relay/carrier reads content | E2EE (box is opaque to all carriers) |
| Relay learns who talks to whom | Rotating HMAC tags; passive broadcast receive where possible; bucketed fetches |
| Peer forges or alters content | Signatures + content hashes (mathematically impossible to forge) |
| Seized device | Encrypted local storage; optional duress vault (deferred) |
| Timing/size traffic analysis | Fixed-size padded boxes; randomized delays; (deferred: constant-rate cover traffic — DTN delay already acts as a free mixnet) |
| Metadata correlation | Minimized, never zero — **we say "hard to trace," never "untraceable"** |

**Lines we do not cross:** no impersonating cellular infrastructure, no bypassing carrier access controls, no stuffing data into services that forbid it, no DNS tricks or borrowed API keys. Anything that gets *users* banned is a betrayal of the user, not a feature. This is a deployment and ethics boundary, not a technical one — and it is part of the spec.

**One known leak:** polling a carrier for your tags reveals "someone is waiting" plus your IP. Mitigations: Tor-wrapped carriers, passive broadcast, bucketed fetching. Never claim elimination.

---

## 9. Incentives & Anti-Abuse

### 9.1 Reciprocity credit [DESIGNED — DEFERRED past v1]

The literature consensus (2024–2026 surveys on intermittent IoT networks; Waku's real-world lesson): **voluntary forwarding is a fiction in adversarial settings, and pure altruism doesn't scale.** Token/blockchain systems import speculation and regulatory exposure — rejected.

The locked design direction (BitTorrent tit-for-tat, non-monetary):

- Local, signed **forwarding ledgers**: "KB relayed for X / KB X relayed for me."
- Credit is **community-scoped and non-transferable** — cannot be sold, only spent by asking the network to carry your boxes.
- Always free to **receive**; publishing into store-carry-forward costs credit or a moderator voucher.
- Local and subjective — I trust my ledger and optionally ledgers signed by peers I already trust. No global score, no Sybil marketplace.
- Cold start: early adopters relay because they want the network to exist; their credit is that investment.

### 9.2 Spam control on open carriers [LOCKED for open carriers]

- **Blind-signed postage** (Chaumian, cryptoStamp-style): moderators blindly sign postage tokens; users spend one unlinkably per publish. Accountability without identity. No blockchain.
- PoW stamps (LXMF-style) as a secondary option for low-volume channels.
- Community-level: rate limits, moderation as signed attributable actions, local blocklists — **moderation is community-scoped, never network-global.**

---

## 10. Governance & Ownership — the two-layer model [LOCKED]

The reconciliation of "big tech may want to buy it" with "humanity owns it." Acquisition logic in the real world: buyers pay for **the ecosystem and the default entry point** (Nvidia→Hugging Face: developer distribution; Microsoft→GitHub: the developer graph) — never for the binary. So:

| Layer | What | License/Owner | Why |
|---|---|---|---|
| **Protocol** (Box/Tag/Receipt, wire formats, Carrier interface) | spec + conformance tests | **Public domain dedication (CC0/Unlicense-class)** | Cannot be bought, closed, or captured. No one — including the founder — owns it. |
| **Reference implementation** | core engine, tests, CLI | **Apache-2.0**, founder as initial BDFL maintainer | Credit in history; anyone can fork; BDFL drives early coherence (the MCP pattern: BDFL authority survived even foundation donation) |
| **Product ecosystem** (wedge app, SDK, hosted convenience, trademark) | the business layer | Founder's, migrating later to a neutral foundation | This — and only this — is what an acquirer can ever buy |

Precedent & cautionary tale: Xen/Citrix — acquisition promises of independence decayed until the community forked (XCP-ng). **Structure before acquisition is what survives.** The protocol goes neutral *first*; the founder's credit is never the thing sold.

Practical artifacts to ship in the repo from day one: `PROTOCOL_SPEC.md` (CC0), `LICENSE` (Apache-2.0), `GOVERNANCE.md` (BDFL → foundation migration path), `SECURITY.md` (threat model + reporting).

---

## 11. Product Strategy — the wedge [LOCKED]

**The one-sentence test** (the best tool produced by the entire research): explain any feature's benefit without the words *peer-to-peer, Tor, torrent, decentralized*. "It never says connecting." "Big files, no cap, no data plan, works on a hotspot." "Open a link, you're in — no signup." Those are benefits. "Store-carry-forward DTN" is not.

### 11.1 The ladder (each rung feeds the next)

1. **WEDGE — "Send anything to anyone."** AirDrop-for-everyone: any size, resumable, no account, Android↔iOS↔desktop, works near (local) or far (internet), honest per-message status (queued/sent/delivered). This is the hook — people have a reason to open it *today*.
2. **SHARED FOLDERS** — the natural bridge. "Send" becomes "this folder stays synced between us" — a room with a filesystem attached, and the seed of a community. *(This rung is the audience-bridge between file-sharers and community-keepers — without it, the wedge plateaus as a utility.)*
3. **COMMUNITIES + THE LIFEBOAT** — the moat. One tap exports a complete, searchable, verifiable community as a file; anyone can mirror or fork it. Communities have been banned, locked behind API changes, and killed by blackouts — this is the answer. Plus drift mode: messages that survive blackouts and boxes no relay can read. **This is the layer Telegram and Reddit cannot copy without deleting their own servers.**

### 11.2 The evidence this can work

- **SHAREit:** reportedly ~1.8B users, 400M+ in India, consistently top-5 most-downloaded in India. Won because sharing large files without spending mobile data was a *daily need*. Weaknesses: bloat, ads, serious security reports; banned in India 2020; replacements scattered; cross-platform Android↔iOS was the killer feature of the one that had it. **The need is huge, the incumbents were bloated or restricted, and a light, ad-free, cross-platform tool is a real gap.** This matches the "small, light, fast, better" brief better than a generic chat app.
- **Telegram:** reached ~1B users against WhatsApp's network effect *purely on feature superiority* (2GB files vs 100MB, 200k groups, channels, bots). Proof that engineering can beat network effects at the margin. (And its reported $8B Nvidia negotiation stalled over **governance**, not price — control is the real currency.)
- **BitChat:** tens of thousands of installs *per day* during Nepal 2025 and Iran 2026 blackouts — people install resilient tools exactly when incumbents fail.

### 11.3 Distribution — the gap the reviews missed

SHAREit won India through **OEM pre-installs**, not features. Hand-to-hand is this architecture's one structural distribution advantage: **the app spreads through the act of sharing itself** — every received file carries an offline "get the app" path (the QR/file carrier *is* the installer channel). A server app can never do that. Design for it explicitly.

### 11.4 The retention test (the only "must-have" definition that isn't fantasy)

Put it in front of **10 people who share files a lot** — a class, a hostel floor, a small team. Watch whether they use it a **second time within a week, unreminded**. If yes: keep going. If no: change the wedge before building more. **A feature nobody returns to isn't a marvel yet.**

---

## 12. Case Studies & Prior Art [USEFUL — study list]

| Project | Take |
|---|---|
| **BitTorrent** | Protocol became unacquirable *because* it was a protocol; clients commoditized; tit-for-tat reciprocity worked without money. Swarm behavior on other people's roads. |
| **Tor / Snowflake** | Volunteers' *browsers* as relays (WebRTC) — the model for "the page is the relay pool." Pluggable transports = traffic that looks ordinary. |
| **BitChat** | 35k+ stars, ~50k downloads/day in Nepal 2025, 70k+ fork downloads before Iran 2026 shutdown. Unlicense, one external dependency, scope discipline. Crisis demand is real. |
| **SHAREit / Zapya family** | Offline file-sharing demand at billion-user scale; bloat and security rot as the opportunity. |
| **Delta Chat** | Encrypted chat over ordinary email — carriers you already legitimately have. |
| **Briar** | Pluggable transports (Tor/BT/Wi-Fi/removable drives); offline-capable messaging done right. |
| **Reticulum** | "Any medium is an interface" — the intellectual grandparent of the Carrier interface. |
| **SimpleX** | No user identifiers at all — one-way queues per conversation. Validated no-account identity. |
| **Meshtastic / LoRa** | Practical radio mesh experience — hardware-dependent, regulated, deferred. |
| **Ceno** | Resilient offline content distribution over BitTorrent swarms. |
| **Secure Scuttlebutt** | Signed identity feeds + gossip sync + offline-first social — many right ideas, note its scaling ceiling. |
| **Swarm Space** | Proof the full v1 stack exists as libraries: React/Vite/TS + IndexedDB + WebCrypto (ECDH/AES-GCM/Ed25519) + PeerJS/WebRTC + WebTorrent DHT + chunked SHA-256 transfer + zero central servers. |
| **Fireweed (PoC)** | Root-key → device-keys → signed posts, chain verified locally, no accounts. The identity model, validated small. |
| **Trystero** | The carrier layer for browsers: no backend, six swappable signaling strategies, chunked transfers, signed state. |
| **Pkarr / Mainline DHT** | Small signed records on the BitTorrent DHT — the pattern for carrier #5. |
| **Hugging Face / GitHub acquisitions** | What acquirers actually buy: developer distribution and the default entry point — the ecosystem, not the code. |
| **Xen/Citrix → XCP-ng** | Post-acquisition independence promises decay; structure-before-sale is the only durable defense. |
| **MCP (Model Context Protocol)** | BDFL authority preserved through foundation donation — the governance migration pattern. |

### Research-literature findings worth keeping [USEFUL]

- **Bundle Protocol v7 (RFC 9171) + BPsec (RFC 9172):** required reading; a future convergence-layer adapter, not the core.
- **Opportunistic-networking surveys (2024–2026):** pure epidemic flooding fails under load; community/encounter-aware routing (HCAR: ~15.6% delivery gain, ~36.5% overhead cut) and RL variants exploit social structure. → Section 6.5.
- **Incentive surveys:** cooperation cannot be assumed; reputation/reciprocity dominate non-monetary designs; tokens import centralization/regulatory problems. → Section 9.1.
- **B-DTN7 (WASM BPv7):** browsers can *participate* in DTN but never *custody* — supports the two-node-class contract.
- **Fountain codes (RaptorQ):** no ACKs, no ordering, no return path; already used in satellite broadcast and air-gap QR transfer (BC-UR family). → Section 3.3.
- **Satellite one-way broadcast:** Blockstream Satellite (free, receive-only, ~$100 kit, pubkey-encrypted content possible); Othernet (downlink-only, uncertain continuity). No free two-way phone satellite exists — and *silently* using someone's network is out of bounds anyway.
- **CRDT benchmarks:** Yjs ~260k ops/s at 1.2–1.6× overhead; Automerge 2.0 ~30% overhead; Loro fastest-but-youngest. → 6.3.
- **js-libp2p browser caveat:** WebRTC/WebSocket/WebTransport transports exist, but peer discovery is explicitly "not battle-tested at scale" — Trystero's signaling abstraction is the pragmatic solo-builder choice.

---

## 13. Technology Stack (locked for v1)

| Layer | Choice | Why |
|---|---|---|
| App | React + TypeScript + Vite (or single-file HTML for the extreme-portability demo) | Static-deployable; single-file = USB-stick portability |
| P2P/carrier transport | **Trystero** (WebRTC; Nostr default signaling, BitTorrent/MQTT/WS fallbacks) | Zero backend; swappable signaling |
| CRDT | **Yjs** (+ `y-indexeddb`) | Benchmarks + ecosystem |
| Local store | IndexedDB + WebCrypto encrypted key storage | The source of truth |
| Crypto | WebCrypto Ed25519 + AES-GCM + HKDF/HMAC | Native, auditable, zero deps |
| Chunking | RaptorQ fountain codes + SHA-256 Merkle manifests | The marvel (3.3) |
| Wire format | Deterministic CBOR (binary chunks); JSON only for export/debug | Compact + verifiable |
| Serialization/human spec | JSON fixtures for interoperability tests | Cross-implementation verification |
| Native (later) | Capacitor wrapper around the same protocol core | Bluetooth/Wi-Fi Direct arrive here, not in the browser |
| Hosting | Vercel static + GitHub (releases, Pages) | C1 constraint; F-Droid for the native app later |

**Explicitly rejected for v1:** Redis, Kafka, any server component, Google Nearby Connections as a core dependency, homegrown crypto, a blockchain/token.

---

## 14. What NOT to build (anti-scope, with reasons) [LOCKED]

1. **No Bundle Protocol routing engine** — dense social topology breaks DTN assumptions; it's an adapter.
2. **No tokens / blockchain / global reputation** — imports speculation, regulation, and the financialization that rots open protocols.
3. **No radio/LoRa integration yet** — hardware-dependent, regulated, premature before the core is proven.
4. **No native app in phase 1** — browser proof first; native is a wrapper, later.
5. **No "untraceable" claims** — ever, in any marketing.
6. **No silent/ToS-violating carriers** — banned users are betrayed users.
7. **No heavy UI framework, analytics, mandatory cloud auth, videos/voice calls, recommendation algorithms** in v1 — the dependency budget is part of the product.
8. **No custom cryptographic algorithms** — policy, not preference.
9. **No perfect-anonymity promises, no global erasure promises** — physics and copies, respectively, say no.
10. **No separate networking identity == social identity** — they must stay separable.

---

## 15. Honest Limits & Open Problems (say these out loud)

1. **No connectivity path = no delivery.** The system survives blackouts *among reachable devices*; it cannot recreate Starlink with software.
2. **Browser custody is bounded** — tab suspension, quota eviction, no background execution. Hence two node classes and the eventual native client.
3. **iOS background = "messages arrive when you open the app"** unless push (which needs a server) is added. State it honestly in the UI.
4. **Metadata is minimized, not eliminated** — timing, sizes (padded), carrier-visible IPs (Tor-mitigable). "Hard to trace."
5. **Open carriers will attract spam** — postage/PoW required from day one of open-carrier support.
6. **Wedge→moat audience gap** — file-sharers ≠ community-keepers; the shared-folder rung is the designed bridge, and it's unproven until tested.
7. **Distribution is unsolved** — the retention test measures product, not spread; the QR/file carrier is the only structural distribution advantage.
8. **Many carriers = many bugs** — duplicates, reordering, half-delivered boxes; fountain codes absorb much of it, testing must absorb the rest.

---

## 16. Roadmap

### The experiments that prove the primitives (in order)

1. **The Bundle/Box experiment (anti-routing proof).** A→B→C: A seals a box for C (B can't read it), B holds it across a disconnect, delivers later over any carrier; C verifies and returns a signed receipt through the next encounter. **Success: C receives without A and C ever being simultaneously reachable.**
2. **The chaos test (multi-carrier scheduler).** Core + three carriers (file, QR, WebRTC). Send a message while randomly killing carriers; box still arrives through survivors. This demo is the pitch — it makes "jumping modes" visible.
3. **The fountain QR demo.** 200KB file → fountain-coded chunks → phone A displays animated QR stream in airplane mode → phone B (starting mid-stream, dropped frames OK) rebuilds the file. Works = the rest of the vision follows from it.
4. **The independence test.** With zero OpenMesh-operated infrastructure: create identity → create community → publish → export snapshot → import on second device → verify signatures → sync via Trystero. All from the static page.
5. **The 10-person retention test.** Hand the wedge to a real file-sharing group; measure second-use-within-a-week, unreminded.

### Six-week build sequence (v1)

| Week | Deliverable |
|---|---|
| 1 | Identity + signed record + IndexedDB + export/import (single static page) |
| 2 | Local-first feed from IndexedDB; box encode/decode (fountain chunks, manifest) |
| 3 | Trystero P2P sync between two browser tabs; signature verification on receipt |
| 4 | File + QR carriers; resumable chunked transfer; chaos test passes |
| 5 | Shared folder (Yjs multi-writer) + one community view; export/import community snapshot |
| 6 | Hardening, SECURITY.md threat model, repo with LICENSE/GOVERNANCE/PROTOCOL_SPEC, public Vercel release |

### After v1 (in priority order)

Drift mode polish → Nostr carrier + blind-signed postage → DHT carrier → reciprocity credit → shared-folder→community bridge at scale → threshold secret sharing across carriers → native app (Capacitor) → satellite receive-only → BPv7 adapter for multi-day/radio hops → MLS group messaging → neutral foundation migration.

---

## 17. One-paragraph pitch (for anyone who asks what this is)

> OpenMesh is a static web app — no accounts, no servers, nothing to sign up for — that lets you send anything to anyone: full speed over the internet when you have it, over a hotspot or QR codes when you don't, resumable at any size. Everything is end-to-end encrypted and signed, so no relay, carrier, or middleman can read or forge it. Communities can be exported as a single verified file, mirrored, and forked — they can't be deleted by anyone but their members. And underneath, one engine — sealed boxes with rotating tags, fountain-coded chunks, and signed receipts — that any developer can build on without permission. The protocol belongs to everyone. The engineer who built it gets the credit.

---

*End of consolidation. Locked decisions are open for revision only with new measured evidence — that rule, too, is locked.*
