# 08 — Research and Links

Legend: [checked] = I opened or found the page in research for this doc set. [standard] = well-known reference, not re-checked now. Treat any numbers as of Nov 2026 and re-verify before quoting.

## Findings that shaped the design
- **Ed25519 in WebCrypto**: shipped in Safari 17, Firefox 129–130, Chrome 137; X25519 in Chrome 133. [checked] https://blog.ipfs.tech/2025-08-ed25519/
- **RaptorQ in the browser**: RaptorQR uses the Rust `raptorq` crate compiled to WASM and offers animated-QR transfer; its README claims production readiness for local offline transfer, and its measured speeds are the project's own numbers. [checked] https://github.com/infrost/RaptorQR · https://github.com/cberner/raptorq · RFC 6330 https://datatracker.ietf.org/doc/html/rfc6330
- **WebRTC without a server**: manual SDP exchange (copy/paste or QR) is possible for LAN/offline use; browsers hide local IPs behind mDNS names. [checked] https://www.videosdk.live/developer-hub/webrtc/can-webrtc-work-without-internet · https://webrtc.rs/blog/2026/01/10/announcing-rtc-v0.7.0.html
- **Trystero**: serverless WebRTC matchmaking with swappable signaling (Nostr default); public issues mention slow or failed connections. [checked] https://github.com/dmotz/trystero · https://security.snyk.io/package/npm/trystero
- **Safari storage**: 7-day cap on script-writable storage for sites not used, not applied to Home Screen apps, which have a separate counter and store. [checked] https://www.theregister.com/2020/03/26/apple_relax_were_not_totally/ · https://developer.apple.com/forums/thread/710157
- **Tauri webviews**: WKWebView (macOS/iOS), WebView2 (Windows), WebKitGTK (Linux), Android System WebView. [checked] https://v2.tauri.app/reference/webview-versions/ · https://github.com/tauri-apps/tauri
- **Tor in browser (experimental)**: Arti compiled to WASM with Snowflake transport; unaudited per README. [checked] https://reads.ethereum.foundation/feed/embedding-arti-in-the-browser · https://ethereum.github.io/tor-js/
- **Media in browsers**: ManagedMediaSource on iPhone from Safari 17.1; needs `disableRemotePlayback` or an HLS alternative. [checked] https://webkit.org/blog/14735/ · https://developer.mozilla.org/docs/Web/API/ManagedMediaSource
- **LocalSend**: open REST protocol v2.1, multicast discovery on 224.0.0.167, port 53317, HTTPS with self-signed certs. [checked] https://github.com/localsend/protocol
- **Syncplay**: server tracks play state and position; each viewer needs their own copy; it is not a file-sharing service. [checked] https://syncplay.pl · https://github.com/kilmanio/syncplay
- **BitChat**: Bluetooth mesh + Nostr; public-domain; reported 30k+ stars and download spikes in Nepal, Madagascar, Iran/Uganda blackouts. [checked via secondary sources] https://dev.to/wonderlab/open-source-project-of-the-day-133-bitchat-bluetooth-mesh-nostr-decentralized-messaging-506h · https://github.com/permissionlesstech/bitchat

## Doc 3 sources (techniques)
- Negentropy range-based set reconciliation: sorts by (timestamp, id), range fingerprints, splits differing ranges; JS reference implementation, MIT. [checked] https://github.com/hoytech/negentropy · Nostr NIP-77 (title only seen) https://nips.4rs.nl/nips/77
- Erasure coding vs replication (expansion n/k, durability, repair cost): [checked] https://www.storj.io/blog/replication-is-bad-for-decentralized-storage-part-1-erasure-codes-for-fun-and-profit
- Plumtree eager/lazy push, IHAVE/GRAFT/PRUNE; assumes a HyParView-style overlay: [checked] https://jepemo.github.io/lessons/gossip-membership-and-epidemic-systems/009.html
- iroh (dial by key, hole punching with relay fallback; Rust): [title only seen, not read] https://docs.rs/iroh/ · https://pinggy.io/blog/iroh_1_0_dial_keys_not_ips/
- Willow / Meadowcap (capabilities, partial sync): [title only seen, not read] https://jzhao.xyz/thoughts/Willow-Protocol
- Browser origin private file system (large blobs): [title only seen; Safari details UNVERIFIED] https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system · https://webkit.org/?p=12257
- LEDBAT, RFC 6817 (delay-based congestion control; the page could not be fetched, so its target value is UNVERIFIED): https://www.rfc-editor.org/rfc/rfc6817
- Standard ideas from background knowledge, not re-checked: hybrid logical clocks, Dynamo-style quorums, rendezvous hashing, Thompson sampling, STREAM-style chunked AEAD (as used by age), FastCDC, Reed-Solomon.

## Standards and tools to read
- WebCrypto API [standard] https://www.w3.org/TR/WebCryptoAPI/
- HPKE RFC 9180 [standard] https://www.rfc-editor.org/rfc/rfc9180
- MLS RFC 9420 [standard] https://www.rfc-editor.org/rfc/rfc9420
- Bundle Protocol v7 RFC 9171, BPsec RFC 9172 [standard] https://www.rfc-editor.org/rfc/rfc9171
- Nostr NIPs (check event size, kinds, gift wrap) [standard] https://github.com/nostr-protocol/nips
- Yjs (for LATER shared state) [standard] https://github.com/yjs/yjs
- Noble crypto libraries (fallback, verify audit notes) [standard] https://github.com/paulmillr/noble-curves
- Capacitor (Android wrapper option) [standard] https://capacitorjs.com/
- Briar, SimpleX, Session, Reticulum: study their identity and transport ideas [standard] https://briarproject.org/ · https://simplex.chat/ · https://reticulum.network/
- Ink & Switch, "Local-first software" [standard] https://www.inkandswitch.com/essay/local-first/

## Claims in Doc 1 I could NOT confirm (do not repeat publicly)
- "521 Swift files" for BitChat; exact star counts beyond "30k+".
- SHAREit total users: sources range 1.2B to 2B+; India daily users reported at about 1.5M around the 2020 ban; the ban status in India remains (reported for 2026).
- Yjs "260k ops/s", HCAR "15.6% / 36.5%" figures.
- Any "~60% of Trystero connections fail" figure. Measure yourself (SPIKE S-5).
- Free-tier hosting limits (Vercel, Cloudflare, GitHub Pages).
- India IT-rules applicability to this kind of tool.
