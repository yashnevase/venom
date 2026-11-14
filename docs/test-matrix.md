# Real-device test matrix

| Test | Device pair | OS and browser | Network | Result | Date | Notes |
|---|---|---|---|---|---|---|
| S-2 / DEV-2 | Xiaomi Note 13 and Mac | Phone OS and browser pending | Hotspot with data off | NOT RUN | 2026-11-14 | Phone identified by owner, manual operation required |
| S2-ACCESS | Xiaomi Note 13 accesses Mac static server | Chrome, exact versions pending | Existing LAN | PAGE LOADED, owner confirmed | 2026-11-14 | Handshake and transfer measured separately |
| S2-LAN attempt 1 | Xiaomi Note 13 and Mac | Phone reduced UA Chrome 157, Mac headless Chromium 159 | Existing LAN, chat-mediated SDP | FAIL, 0 bytes | 2026-11-15 | Phone timeout at 246918 ms before answer application, Mac ICE failure at 15184 ms. Manual timeout regression fixed. |
| S2-LAN attempt 2 | Xiaomi Note 13 and Mac | Phone Chrome reduced UA 157, Mac headless Chromium 159 | Existing LAN, chat-mediated SDP | VERIFIED 4096 bytes at both endpoints. Mac 52841 ms, phone 118941 ms. Under-30-second target FAIL. | 2026-11-15 | Both reports saved. Endpoint timings start from separate offer/answer creation events. Offline-hotspot handshake remains NOT RUN. |
| S-2 / DEV-2 | Android and Android | Pending second phone | Hotspot with data off | NOT RUN | 2026-11-14 | Second Android unavailable |
| S-2 / DEV-2 | Android and iPhone | Pending iPhone | Hotspot with data off | NOT RUN | 2026-11-14 | iPhone unavailable |
