# 06 — Privacy, Security, Legal

## 1. Threat model (honest table)
| Threat | v1 protection | Remaining gap |
|---|---|---|
| Carrier/relay reads content | End-to-end encryption | none for content |
| Carrier forges or alters content | Signatures, AEAD, chunk hashes | A carrier can still withhold or delay |
| Carrier learns who talks to whom | Counter tags, throwaway signing keys for relay events, no identifiers in headers | Polling reveals "someone is waiting" and an IP; timing correlation |
| Peer sees your IP | Inherent in direct WebRTC | Use Mailbox-only mode or Tor mode (LATER) |
| Stolen device | Passphrase-encrypted keys (optional), quick wipe | No forward secrecy for old messages if keys are stolen |
| Traffic analysis | Padded size buckets, coarse timestamps | Not mixnet-grade |
| Spam in open carriers | Rate limits; blind-signed postage or proof-of-work (LATER but required before public open channels) | |
Language rule: say "private" and "hard to trace". Never "anonymous", "untraceable", or "military-grade".

## 2. Tor / extra-private mode (DECIDED as optional, LATER in scope)
- A toggle: "Extra private mode — slower, hides your network address, may fail on some networks."
- v1 scope: not included. First implementation: **native apps only**, bundling the official Rust Tor client (Arti) or a system Tor; messages go to mailbox relays through Tor.
- Browser Tor is possible only through experiments (Arti compiled to WebAssembly, using Snowflake-style bridges; a gateway is needed because browsers cannot open raw TCP; the experimental projects state they are unaudited and not a replacement for Tor Browser). Treat as LATER research.
- Tor and peer-to-peer file swarms conflict: swarms expose peer addresses; Tor is slow for bulk data. So Tor mode = messages and small boxes only; big files stay on direct paths or via a private relay the user chooses.
- Do not market for high-risk users until an independent review exists.

## 3. Supply-chain risk of "the app copies itself"
A tampered copy of the app can steal keys. Rules:
1. Show the app's own fingerprint (hash of the bundle) on a visible "About" screen.
2. Publish the official hash on the project site and in each release (signed list).
3. A copy received from another person should say: "Copy came from a friend. Compare this code with the official site before entering a recovery phrase." (SPIKE S-4 will decide how it is shown.)
4. Never ask for the recovery phrase inside a copy; only in the official install.
5. Desktop installers: unsigned builds will warn users. Publish hashes and a short "how to verify" page. Buy code-signing only when users justify it.

## 4. Abuse and safety in chat
- Block/mute per contact; messages from unknown tags are only shown after an invite.
- No global search of users. Contact only by invite link/QR.
- Reporting is local (hide, block). There is no central moderator, and the docs/UI must say so.

## 5. Key and data loss
- Show the recovery phrase once at setup and test the user ("type word 7").
- Browser data can disappear (eviction, Safari 7-day cleanup for uninstalled sites). Nag for backup after the first message and weekly.
- Export file is signed and encrypted; import verifies it.

## 6. Legal cautions (not legal advice; consult a lawyer before public launch)
- **Copyright**: a tool built for sharing movies will get a piracy label (store removal, host takedowns, possible claims against the maker). Position as: family media, community content, creators' own work, licensed material. Do not advertise movies.
- **Public channels/communities** bring moderation duties (defamation, illegal content). India's IT rules on intermediaries may apply to services that host or disseminate user content; applicability to a decentralized tool is UNVERIFIED. Start with private/invite-only groups; get advice before public channels.
- **Local ads** bring consumer-protection, tax, payment and fraud duties. Not before real usage.
- **Encryption and export rules** differ by country; check before distributing builds beyond your own country.
- **App stores**: peer-to-peer and messaging apps face extra review; plan web + direct downloads first.
- **Vercel free plan** is for non-commercial use and has usage limits (UNVERIFIED current numbers). Use it for the landing page; keep installers on GitHub Releases; check Cloudflare Pages and GitHub Pages terms.
- **Licenses**: protocol spec CC0; reference code Apache-2.0; track every dependency license.

## 7. Governance (kept from Doc 1)
Protocol = public domain. Reference implementation = Apache-2.0 with you as maintainer. Product brand = yours. No action needed until users exist beyond adding LICENSE, GOVERNANCE.md, SECURITY.md (threat model + how to report bugs) to the repo.
