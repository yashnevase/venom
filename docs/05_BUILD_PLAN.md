# 05 — Build Plan (for you + Codex)

## 1. Repo layout (DECIDED)
```
openmesh/
  AGENTS.md
  docs/                     (Doc 1, this set, /adr)
  packages/
    core/                   CHASSIS: crypto, identity, box, tag, receipt, chunker, manifest, carrier types
    test-vectors/           JSON vectors + runner
    carriers/
      file/  qr/  webrtc/  nostr/
    store/                  indexeddb adapter, sqlite/file adapter, backup export
    engine/                 outbox, scheduler, sessions, sync
    sim/                    fake carriers, chaos test, load simulator
    app-web/                PWA UI
    app-desktop/            Tauri shell around app-web
  tools/                    scripts, release hash tool
```
Tooling (DECIDED): TypeScript strict, pnpm workspaces, Vitest, Playwright (browser tests), ESLint, CI on GitHub Actions. Schemas validated at module boundaries (e.g. Zod). No UI framework until Phase 2 needs one; keep it light.

## 2. Spikes (do these FIRST, each is 1–3 days, each ends with a written result in /docs/spikes)
| ID | Question | Pass condition |
|---|---|---|
| S-1 | RaptorQ WASM encode/decode speed, memory, battery on 3–4 year old Android and an older iPhone; QR scan success | Numbers published; pick QR frame size and fountain threshold |
| S-2 | Offline WebRTC via QR/typed-code handshake: Android<->Android, Android<->iPhone, Mac<->phone, on a hotspot with no internet | Connects in under ~30 s without errors on all pairs, or list which fail and why (mDNS, AP isolation) |
| S-3 | Nostr small-box mailbox: kinds accepted, size limits, retention, delivery delay across >= 5 public relays | A 4 KB and a 16 KB sealed box retrievable after the recipient was offline for an hour on >= 3 relays |
| S-4 | Saved single-file app copy: how Android, iOS, Mac open it; does crypto/storage work from a local file; what breaks | Written matrix and a decision on "save the app" UX |
| S-5 | WebRTC connection success rate over many real networks incl. mobile data, with and without TURN | Measured success % per network type |
| S-6 | Swarm load simulation: 50/500/1000 virtual clients, one web seed, churn | Chart of median/p95 download time vs clients |
More spikes S-7 to S-10 (browser large files, one-QR handshake, holder uptime, pacing, relay quorum) are in `10_TEST_STRATEGY.md`. Which techniques land in which phase is in `09_ENGINEERING_TECHNIQUES.md` section 2 and `11` section 9.
Do not skip S-2: it decides whether the offline promise is real.

## 3. Phases (each = one PR series; gate = acceptance test must pass)
**Phase 0 — Foundations (1–2 days).** Repo, tooling, CI, AGENTS.md, ADR template. Gate: CI green on an empty test.

**Phase 1 — Protocol core in Node, no UI (week 1).** Identity, seal/open (small + chunked profiles), tags, receipts, test vectors. Gate: all vectors pass; fuzz test of random corruption never crashes; `core` has no browser or network dependency.

**Phase 2 — File carrier + minimal web UI (week 2).** Create identity, write message / pick file, export a sealed bundle file, import on a second browser profile, verify and decrypt, produce receipt file. Gate (Gate A part 1): works between two fresh profiles with the network disabled. Test on Mac browser, Android Chrome, iPhone Safari.

**Phase 3 — WebRTC carrier (weeks 3–4).** Chunked profile with resume bitmap; QR/typed-code handshake; Nostr signaling as the online path. UI shows honest status. Gate: 200 MB file transfer resumes after a forced disconnect; chaos test with WebRTC killed still completes via file export.

**Phase 4 — Nostr mailbox + 1:1 chat (weeks 4–5).** Async delivery of small boxes, receipts, outbox states, chat screen. Gate: sender offline-then-online and recipient offline-then-online still exchange a message and receipt, with the two never online at the same moment.

**Phase 5 — QR fountain carrier (week 5–6).** Use the library chosen in S-1. Gate: 200 KB file between two phones in airplane mode, receiver starting mid-stream, dropped frames, verified result. Also publish measured speed.

**Phase 6 — Desktop app (week 6–7).** Tauri shell, tray, persistent store, backup/restore, update check. Gate: runs on Mac; Windows build produced; chat and file work with the app minimised.

**RETENTION GATE (Gate B).** Hand it to 10 heavy file-sharers. Measure second use within 7 days unreminded, and note every confusion. Do not start Phase 7 until you have this result.

**Phase 7 — Small groups (fan-out) and multi-device pairing.** Gate: 10-member group, one member offline for a day, receives everything on return.

**Phase 8 — Communities + publisher + load proof.** See `07`. Gate C: S-6 result must hold with the real code, not just the simulator.

**Later**: Android native, audio/video, Tor mode, ads. See `07`.

## 4. Definition of done for any module
Types compile with no `any` at boundaries; unit tests; for network code, a chaos/fault test; documented in the module README; no new dependency without an ADR; tested on a real phone for anything that touches camera, storage or network; accessibility basics (labels, contrast, tap size).

## 5. Prompt template for Codex
```
Read AGENTS.md, docs/03_ARCHITECTURE.md, docs/04_PROTOCOL_DRAFT.md.
Task: implement <ONE MODULE> from Phase <N> of docs/05_BUILD_PLAN.md.
Allowed to edit: <list of folders>. Forbidden: packages/core unless the task says so.
Public API to expose: <function signatures>.
Acceptance test (write it first): <exact test>.
Do not invent new transports, storage models, or cryptography.
If the architecture seems wrong, stop and write docs/adr/NNN-*.md instead of changing it.
When finished: list files changed, tests run, and anything NOT verified on a real device.
```
Rules for you: one module per session; paste only the needed docs; ask for the test BEFORE the code; run it yourself; commit after each green step.

## 6. Real-device test matrix (minimum)
Mac (Safari and Chrome), Windows laptop (Chrome/Edge), one older Android phone (3+ years old), one recent Android, one iPhone. Networks: home Wi-Fi, phone hotspot with no data, mobile data only. Record results in `/docs/test-matrix.md`.

## 7. Release hygiene
Every release: build from CI, publish SHA-256 of every installer and of the web bundle in the release notes, sign the hash list with a release key you hold offline. See `06` for why.
