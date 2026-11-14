# 02 — Product and Scope

## 1. One promise (DECIDED)
**"Send a message or any file to anyone — no account, no phone number, works with weak or no internet."**

First audiences, in order:
1. People who share large files between phones and computers (students, hostel floors, small teams) without spending mobile data.
2. Person-to-person private chat where connectivity is poor (families, remote places).
3. Small communities (housing society, college club, local group) needing a notice board that nobody can take down. (After the retention gate.)

## 2. The "grandpa on a farm" case — what is honestly possible
Goal: a short important message leaves grandpa's phone and reaches you with a delivery receipt.
- **Works if ANY path appears**, even briefly: one bar of mobile data, a neighbour's Wi-Fi, a passing phone, a USB stick, a QR scan.
- **Needs the native Android app** (later phase) to hold the message and send automatically when a path appears. A browser tab cannot run in the background.
- **Web version (v1)**: grandpa writes the message; when he has any connection the page sends it as a small sealed box to relay mailboxes; you receive it when you next open the app. Both do not need to be online at the same time.
- **If no path ever appears, nothing is delivered.** The system cannot create connectivity.
- UI wording: "Waiting for a path", "Sent to mailbox", "Delivered and verified". Never technical terms.

## 3. v1 scope (what ships)
| Included | Notes |
|---|---|
| Local identity (no account) | Keys in the device. Backup file + recovery phrase. |
| 1:1 chat (text) | Sealed boxes, delivery status, receipts. |
| Send any file | Resumable, chunked, any size the device can handle. |
| Small groups (<= ~20) | Fan-out: one sealed copy per member. |
| Carriers: file export/import, WebRTC (with QR/code handshake), Nostr mailbox (small boxes + signaling), QR stream (small payloads) | Each is an adapter on one interface. |
| Web app (PWA) + Mac desktop app (Tauri) | Same TypeScript core. |
| Minimal UI | Few screens, big buttons, fast. |

## 4. NOT in v1 (do not let these leak in)
Reddit/Twitter-style feeds and following, public channels, communities with moderation, audio/video streaming, voice/video calls, paid local ads, Tor mode, reciprocity credit, threshold secret sharing, DHT carrier, Bluetooth/Wi-Fi Direct, satellite, MLS groups, any token or blockchain, any analytics. All are in `07_LATER_ROADMAP.md` with their prerequisites.

## 5. Platform order (DECIDED)
1. **Web (PWA) + Mac desktop (Tauri)** — you build and test here.
2. **Windows desktop** — same Tauri code, packaged.
3. **Android** — wrapper (Capacitor or Tauri mobile) for background sending and local Wi-Fi.
4. **iPhone last** — background limits and store rules make it the hardest. The web app on iPhone works as "messages arrive when you open the app", and must say so.
Unsigned desktop builds are acceptable early: distribute from your site, show a clear "your OS will warn you; here is how to verify the file" page with the file hash.

## 6. Competitors (know them, differentiate honestly)
| Tool | Strength | Limit | Our angle |
|---|---|---|---|
| AirDrop / Nearby Share | Instant when it works, built in | Platform-locked or nearby-only | Works across platforms and over distance |
| LocalSend | Open, no accounts, no ads, LAN, open REST protocol | LAN only | Internet + QR + file in one tool |
| PairDrop / Snapdrop | Browser, no install | Needs signaling server, no durable delivery | No server we run, async mailbox |
| WhatsApp / Telegram / Signal | Huge networks | Accounts/phone numbers, server-dependent | No account, works with poor/no connectivity |
| BitChat / Briar | Offline mesh messaging | Mostly text, native only (BitChat: reported iOS/macOS + Android) | Files and communities, web access |
| Syncplay | Watch-together sync | Needs a server, no file distribution | Later: serverless room + file distribution |
Weak point to admit: on the same Wi-Fi, AirDrop/LocalSend are already instant. Win in the cases they fail: cross-platform, remote, intermittent, blackout.

## 7. Success gates
- **Gate A (technical)**: Phase 2 acceptance test passes on a real Android phone, a real iPhone, and a Mac (see `05`).
- **Gate B (product)**: 10 people who share files often use it a second time within 7 days, unreminded. If not, change the wedge. Do not build communities first.
- **Gate C (load)**: a simulation shows download time per client does NOT grow linearly as peers are added (`03`, load model).

## 8. UI principles
- Four screens: Chats, Send, Receive/Scan, Settings.
- Every screen has one primary action. No feature menus, no animations that cost battery.
- Status words: Waiting for a path / Sent / Held nearby / Delivered / Verified.
- Per-carrier honesty: QR "best for small things", WebRTC "both devices must be open", Mailbox "delivered when they open the app".
- Target (not fact): app loads in under 2 s on a mid-range phone; initial bundle as small as possible; no UI framework heavier than needed.

## 9. The distribution loop
Every file or message can include a small "get the app" block (link + QR). After a transfer, the receiver sees "Save this app for offline use". Integrity rules for this are in `06`.
