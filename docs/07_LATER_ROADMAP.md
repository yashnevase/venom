# 07 — Later Roadmap (after the retention gate)

Order matters. Each item lists what must be true first.

## L1. Communities and channels (signed feeds) — Phase 8
- **Idea**: a community or channel is a public key plus a signed, append-only feed of items (posts, notices, files). Followers fetch by key. One engine covers announcements, local news, notice boards, family feeds, and later Reddit-style threads.
- **Needs first**: Gate B passed, group fan-out working, export/import working.
- Features: pseudonym per community, local blocklists, moderator-signed actions, "lifeboat" export (a full community as one verifiable file).
- Moderation is community-scoped, never network-global. Public channels need legal review (`06`).

## L2. Heavy-load publishing (the "result-day" pattern)
- Publisher creates a signed, sharded static bundle; clients fetch only the slice they need; any host or peer can mirror; signature proves authenticity.
- Per-user private lookups need a real secret (never just roll number + date of birth, which can be guessed offline).
- Hosting: static files on a CDN/free host, peers help only for popular content. Browser tab limits apply.
- **Needs first**: S-6 load simulation passes with real code; station box option.

## L3. Station box (always-on nodes)
A small Node/Tauri build that keeps chosen content or mailboxes alive: an old PC, a Raspberry Pi, a community member's machine. It is a "custodian" in the node classes. Needs: storage budget, bandwidth cap, simple admin UI.

## L4. Android native app
Foreground-service custody, queued outbox auto-sends when any path appears (the grandpa case), local Wi-Fi/hotspot transfers. iPhone stays "messages arrive when you open the app" unless push (which needs a server) is added.

## L5. Audio channels (radio)
Short signed audio segments (a few seconds each) from broadcaster to listeners, relayed lightly between listeners. Delay 5–15 s is normal. Needs: L1, L3 (so channels do not die when the host sleeps).

## L6. Video: pre-downloaded watch-together, then small live
- Watch-together: every viewer has the file (from the swarm or by sharing), only play/pause/position signals are sent. Syncplay proves the pattern but needs a server; ours can use a serverless room.
- Playback: desktop apps embed a proper player (libmpv/VLC). In browsers use Media Source Extensions; iPhone Safari needs ManagedMediaSource (Safari 17.1+), which only activates when remote playback is disabled or an HLS alternative is given. Test early.
- Live video to many viewers is hard: each relaying viewer uploads multiple times the stream rate. Target small audiences (tens), not thousands. Never promise large live streaming.
- Position around family and community content, not movies (`06`).

## L7. Calls
Plain WebRTC audio/video for 1:1 and small groups (about 4–6). Larger needs servers; do not promise it.

## L8. Local announcements and ads
Free notices first. Paid ads only after real usage; needs advertiser verification, payment handling, abuse process, local-area targeting that does not track people. Blind-signed postage or per-post fees can fund spam control.

## L9. Other carriers
Mainline DHT (small pointers), reciprocity credit (non-monetary, community-scoped), threshold secret sharing across carriers, Bluetooth/Wi-Fi Direct (native), satellite receive-only, Bundle Protocol v7 adapter for multi-day radio hops.

## L10. Group crypto upgrade
Move from per-member fan-out to MLS (RFC 9420) using an audited implementation. Add a ratchet for forward secrecy in 1:1.

## L11. Optional LocalSend interop (native only)
Implement LocalSend protocol v2.1 discovery and upload in the desktop/Android apps so users can exchange files with LocalSend users on the same LAN. Check license and protocol stability first.

## L12. Developer surface
Conformance test vectors (already in Phase 1) -> small TypeScript SDK exposing `createIdentity`, `sealBox`, `openBox`, `exportBox`, `importBox`. Only when outsiders ask to build on it.

## Rule for adding any item
Write an ADR: user problem, which existing carrier/module it reuses, dependency cost, legal impact, test gate, and what it will NOT do.
