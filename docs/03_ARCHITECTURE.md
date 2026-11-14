# 03 — Architecture (v1)

## 1. Layers (top depends on bottom, never the reverse)
```
UI (app-web / app-desktop)         screens only, no protocol logic
Engine (outbox, sessions, scheduler, sync)    decides WHEN and WHICH carrier
Protocol core (crypto, identity, box, tag, receipt, chunking, manifest)   the chassis
Carriers (file, qr, webrtc, nostr)  dumb pipes behind one interface
Store (indexeddb | sqlite/files)    working set + durable export
```
Rule: **the chassis (protocol core) is small, typed, tested, and changed only by the human owner.** AI sessions build modules ABOVE it.

## 2. The three primitives (summary; full detail in `04`)
- **Box**: sealed payload plus signed manifest. Encrypted to the recipient. Carriers cannot read it.
- **Tag**: a short value derived from a shared secret and a counter, letting the recipient find their boxes on a carrier without the carrier learning who talks to whom.
- **Receipt**: a signed proof of delivery that travels back as another small box.

## 3. Carrier interface (DECIDED)
```ts
interface Carrier {
  id: string;
  caps: { direction: 'send'|'receive'|'both'; maxBoxBytes: number; latency: 'live'|'async'|'manual'; needsInternet: boolean };
  available(): Promise<boolean>;
  put(box: SealedBox, opts?: { tag?: Uint8Array }): Promise<PutResult>;
  poll(tags: Uint8Array[], since?: number): AsyncIterable<SealedBox>;
}
```
Carriers never parse content, never hold keys, never retry policy. The engine does.

## 4. Carriers for v1
| Carrier | Use | Honest limits |
|---|---|---|
| **File** (export/import, share sheet) | Durable copy, zero infrastructure, backup, distribution | Manual |
| **WebRTC DataChannel** | Live transfer, big files. Signaling: (a) QR/typed-code handshake built directly on `RTCPeerConnection`, works with no internet; (b) Nostr relays as automatic signaling when online | Some networks block it (carrier NAT, dorms). A TURN relay is needed for reliability and free TURN is limited. Local connections depend on mDNS and a network that allows multicast/peer traffic. **SPIKE S-2, S-5** |
| **Nostr mailbox** | Small sealed boxes only (target <= 16 KB plaintext): messages, receipts, invites. Async delivery when the other side is offline | Relays may drop or refuse events; publish to >= 3 relays, retry, expect no retention guarantee. Check kinds/policies. **SPIKE S-3** |
| **QR stream** | Small payloads between nearby phones, offline | Reported throughput ~180–250 KB/s for the RaptorQR project on a new iPhone (UNVERIFIED for your devices). A 5 MB file takes about half a minute of holding phones steady. **SPIKE S-1** |
Trystero is allowed for room discovery over Nostr and as one signaling strategy, but it must stay swappable. Its connection reliability is mixed in public reports. Treat WebRTC as best-effort and ALWAYS offer the file fallback in the UI.

## 5. Scheduler / engine
- **Outbox**: every outgoing box is stored with state `queued -> sent-to-carrier -> held -> delivered(receipt) -> failed`.
- Policy modes `fast` (one live carrier), `reach` (all available in parallel), `quiet` (few carriers). v1 ships `fast` and `reach` only.
- Dedupe by `box_id`; backoff on failed carriers; health checks surfaced as human status.
- **Chaos test** (required): randomly kill carriers mid-transfer, including killing WebRTC entirely; the box must still arrive via a surviving path.

## 6. Storage
- **Web**: IndexedDB for the working set, `navigator.storage.persist()` requested, explicit quota checks, export/import of a signed backup file. Safari quirk: unused sites can be wiped after 7 days; installed Home Screen apps have a separate store and are not subject to that cap. Safari and the installed app do NOT share data, so identity must be created AFTER install or restored from backup.
- **Desktop**: SQLite or files in the app data folder.
- **Wire/export format**: deterministic CBOR. JSON only for debug and test vectors.
- Key storage: encrypted at rest with a user passphrase (optional) plus recovery phrase.

## 7. Node classes (DECIDED)
- **Light node**: browser tab or phone app in the foreground. Sends, receives, caches. Never promises to hold other people's boxes.
- **Custodian**: desktop app (tray) or Android app with a foreground service, or a station box. May hold boxes for others later (post-v1).

## 8. Platforms and packaging
- One TypeScript monorepo. Same core runs in browser, Tauri webview (WKWebView on macOS, WebView2 on Windows, Android WebView), and Node (tests, station box).
- Tauri shell: system tray, auto-start option, file associations, updater. Linux (WebKitGTK) is NOT a v1 target; WebRTC support there is unchecked.
- Vercel: landing page and web build only. Installers on GitHub Releases.

## 9. Load model (what "handles many users" truly means)
**Scales well**: many people wanting the same public content (an announcement file, an app update, a shared video). Each downloader can also upload, so more demand adds supply (BitTorrent logic). The first seed can be a free static host ("web seed"), peers share the load after that.
**Does not scale on its own**: per-user private data (needs a database), many simultaneous writers (needs coordination/CRDT, and costs), and content nobody is currently holding (needs a station box or web seed).
**Browser limits**: a tab can hold only a limited number of WebRTC connections. Use small rooms/swarm neighbourhoods (target ~5–10 active peers per tab), not full meshes.
**Pattern for big institutional notices (LATER)**: static, sharded, signed files on a CDN or free host, plus optional peer help. No live database per visitor. This is how result-day style traffic is actually survived.
**Proof required before any public claim (Gate C)**: simulator in `packages/sim` with 50, 500, 1000 virtual clients, one web seed, churn. Report median and p95 download time and seed bandwidth. If time grows linearly with clients, the claim is false and we say so.

## 10. Extensibility rules
- New feature = new module calling the Carrier interface and the core API. No new transport, no new storage model without an ADR.
- Protocol messages carry a version byte. Unknown versions are ignored safely, never crash.
- Feature flags in one `config` module; no scattered constants.
- Dependency budget: every new dependency needs a line in `docs/adr` (why, size, audit status).
