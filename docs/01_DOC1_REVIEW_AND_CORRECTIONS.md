# Doc 1 Review: what it missed, what was wrong, and why

## A. Kept as-is (still correct)
- Constraint-driven thinking: no server we operate (C1), credit without control (C2), spread on merit (C3), honest privacy claims (C4).
- Box / Tag / Receipt as the vocabulary; "dumb carriers, smart endpoints"; DTN is an adapter, never the engine (VENOM does not route through DTN; it can fall back to it later).
- Local keys, no accounts, root key -> device keys; no custom crypto; no tokens/blockchain.
- Two protocol layers: public-domain protocol spec, Apache-2.0 reference implementation.
- Scope discipline (BitChat lesson), the one-sentence benefit test, the 10-person retention test.

## B. Technical errors or gaps in Doc 1 (with fixes)

| # | Doc 1 said | Problem | Fix in Doc 2 |
|---|---|---|---|
| 1 | Fountain chunks are each hash-checked against a Merkle manifest (3.3) | Fountain (RaptorQ) repair symbols are generated on the fly, so a manifest cannot list their hashes up front. The two ideas conflict. | **Profiles.** Reliable carriers (WebRTC, swarm, file) use plain verified chunks with a hash manifest. Fountain codes are used ONLY for one-way/lossy carriers (animated QR, broadcast). Details: `04`. |
| 2 | WebRTC "works on a hotspot, no internet" | WebRTC needs a signaling channel. Default signaling (Nostr, trackers) needs internet. | Offline handshake by QR/typed code built **directly on RTCPeerConnection** (not via Trystero, which does not provide it). Browsers also hide local IPs behind mDNS names; some networks block multicast. **SPIKE S-2** on real devices. |
| 3 | Nostr relays as a general carrier | Relays are built for small events (commonly ~64 KB cap, unverified per relay). | Nostr carries only **small sealed boxes** (messages, receipts, pointers) and is also the async "mailbox" so delivery works when the other person is offline. Never files. |
| 4 | IndexedDB is the source of truth | Safari deletes script-writable storage after 7 days without use, unless installed to Home Screen; Safari and the installed app have separate storage. No persistence guarantee elsewhere either. | IndexedDB is the **working set**. The signed export file is the **durable copy**. Onboarding pushes install + backup. Native apps use SQLite/files. |
| 5 | Rotating HMAC tag by time window | Clock skew and long offline periods break time windows. | Counter-based tags (HOTP-style) with a lookahead window. Details: `04`. |
| 6 | Browser-only, Vercel-only | Blocks background custody, Tor, Bluetooth/Wi-Fi Direct, reliable storage. | Browser = the "try instantly" door. **Native desktop (Tauri) and Android are the real products.** Vercel = landing page + web build. Installers on GitHub Releases. |
| 7 | "Tor wrapper for any IP carrier" | Browsers cannot open raw TCP. Tor-in-browser exists only as experiments (Arti compiled to WASM + Snowflake bridges), unaudited per their own README. | Tor mode is **native-only in v1 scope**, optional toggle. Browser Tor = LATER experiment. |
| 8 | Self-copying single HTML file as distribution | Great idea, but a tampered copy can steal keys. iOS/Android also open local HTML files with restrictions (no service worker, different storage origin). | Keep the idea, add integrity rules (`06`) and **SPIKE S-4** on how each OS opens a saved copy. |
| 9 | Six-week plan including shared folders, CRDT, communities | Too large for a solo builder. | Phased plan with hard gates in `05`. Chat + files first. Communities after the retention gate. |
| 10 | No load/concurrency model | The "handles many users" claim was untested and vague. | `03` section "Load model": what scales (popular public content), what does not (per-user queries, many writers). Simulation before any claim. |
| 11 | No competitor map | LocalSend (open protocol, LAN), PairDrop (browser), Syncplay, BitChat, Briar, SimpleX, Session already exist. | `02`. Differentiator = one engine that works over internet, nearby, QR and file, with no accounts. |
| 12 | Group messaging "later, MLS" | Users expect groups. | v1: small groups by per-member sealed fan-out (simple, secure, bandwidth-heavy, cap ~20). MLS later. |
| 13 | Nothing about key loss, multi-device pairing UX, spam/blocking in chat, update trust | Real products need these. | `04` (pairing, recovery) and `06` (abuse, update trust). |
| 14 | Acquisition framing in several sections | Distracts from the retention test. | Removed from the build path. Governance model kept, but no work on it before users exist. |
| 15 | Market numbers (SHAREit user counts, benchmarks) stated as facts | Sources disagree (1.2B–2B+ global; India figures vary by date). | Marked UNVERIFIED in docs. Do not quote them in marketing. |

## C. New ideas added in Doc 2
- **Station box**: a cheap always-on node (old PC/phone/Raspberry Pi) a community can run to keep content alive. This solves "nobody online = content gone".
- **Web seeds**: free static hosting acts as the first seed for popular content; peers take load off it as demand grows.
- **LocalSend interop (LATER, native only)**: LocalSend publishes an open REST protocol (v2.1). Implementing it in the native app would let you exchange files with their users on a LAN on day one.
- **Syncplay-style watch-together** needs only play/pause/position signals once every viewer has the file. No streaming server needed.
- **Honest per-carrier labels in the UI** ("QR is for small things", "needs both phones awake").

## D. Things Doc 1 got right that reviewers doubted
- Signed identity chain, E2EE, and no-account design are fine for v1.
- Ed25519 and X25519 are now in WebCrypto in all three browser engines (Chrome from 137 for Ed25519). Keep the "no big crypto library" goal, with a vetted fallback only if feature detection fails.
