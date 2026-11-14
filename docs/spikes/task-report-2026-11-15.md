# Task report — 2026-11-15

## Task and phase

Project setup, Phase 1 Tag subset and S-2 diagnostic experiment.
Phase 0 passed its gate. Phase 1 is partial with encryption explicitly kept gated
by the owner. The existing extracted files were treated as v3 per the owner's
confirmation. The original documents retain their historical headings.

## Commits and branches

- main contains foundation commit 9bb267a.
- phase-1/protocol-core contains code commit 3703e3e.
- Both commits were pushed to origin and passed GitHub Actions.
- A follow-up documentation commit records the phone measurements and this report.

## Tests run

- P0-ACCEPTANCE initially failed for missing package.json, then passed.
- Tag acceptance initially failed for the missing source module, then all 6 tests passed.
- P0-SMOKE passed. Combined Vitest count is 7 passed, 0 failed.
- S2-LOCAL and S2-INPUT initially failed for the absent diagnostic page, then passed.
- S2-MANUAL reproduced offer expiry, failed, then passed after the timing fix.
- Final browser count is 3 passed, 0 failed. Combined automated test count is 11.
- VEC-TAG passed 8 JSON vectors in TypeScript and the independent Python verifier.
- 256 deterministic HMAC comparisons passed against Node crypto.
- The built ESM public entry was imported successfully in Node.
- Strict types, typed lint, core and diagnostic builds, and git diff checks passed.
- Dependency audit reported 0 advisories across 165 locked dependencies.
- License checks inspected 135 installed package versions locally.

## Measured

Mac arm64, Node 24.11.0, pnpm 11.25.0. Local Chromium 159 headless contexts
verified 4096 bytes in 366 ms with HTTP blocked and no ICE servers.
The real Xiaomi Note 13 loaded the local page. First LAN attempt received 0 bytes
and expired before the answer was applied. The corrected second attempt verified
4096 bytes at the Mac in 52841 ms, including manual chat-mediated SDP exchange.
It missed the 30-second target. Raw available reports are in docs/spikes.

## Not verified on a real device

No no-internet hotspot handshake, QR handshake, camera, persistent storage,
identity, seal/open, receipts, chunked profile, recovery or large-file transfer
has been verified. Tag conformance ran in Node. The second phone report and its
actual Android version have been requested. Android–Android and Android–iPhone
pairs remain untested.

## Claims ledger rows added or changed

Foundation local checks and CI, offline WebRTC pending, Phase 1 encryption pending,
Tag derivation/window, local diagnostic transfer and closure, bounded diagnostic
parsing, manual-exchange regression, initial LAN failure, corrected LAN completion,
missed 30-second target, and remote implemented-subset checks. Failed observations
remain visible in docs/claims-ledger.md.

## Known problems and decisions

Encryption awaits the reviewed wire-format choices in ADR 002, per the owner's
explicit decision. Interpreting u64 as big-endian and K_tag as 32 bytes are
implementation assumptions recorded there, pending protocol freeze. D-6 tag
resync remains unresolved. Initial diagnostic timing incorrectly included the
manual exchange window in its timeout. It was reproduced and fixed. Phone LAN
success used chat for signaling and cannot establish offline-hotspot behaviour.
Production multi-carrier SC-10 remains a later-phase gate. This task does not
pass the complete Phase 1 or Gate A acceptance criteria.

## Files changed

The project began with extracted documentation. The following tracked paths were
added or updated during setup and implementation.

- `.github/workflows/ci.yml`
- `.gitignore`
- `.node-version`
- `AGENTS.md`
- `LICENSE`
- `README.md`
- `docs/00_START_HERE.md`
- `docs/01_DOC1_REVIEW_AND_CORRECTIONS.md`
- `docs/02_PRODUCT_AND_SCOPE.md`
- `docs/03_ARCHITECTURE.md`
- `docs/04_PROTOCOL_DRAFT.md`
- `docs/05_BUILD_PLAN.md`
- `docs/06_PRIVACY_SECURITY_LEGAL.md`
- `docs/07_LATER_ROADMAP.md`
- `docs/08_RESEARCH_AND_LINKS.md`
- `docs/09_ENGINEERING_TECHNIQUES.md`
- `docs/10_TEST_STRATEGY.md`
- `docs/11_DATA_MODEL_AND_ALGORITHMS.md`
- `docs/AGENTS.md`
- `docs/LICENSE`
- `docs/adr/000-template.md`
- `docs/adr/001-foundation-tooling.md`
- `docs/adr/002-phase-1-envelope-decisions.md`
- `docs/claims-ledger.md`
- `docs/openmesh_master_research.md`
- `docs/spikes/S-2-offline-webrtc.md`
- `docs/spikes/phase-0.md`
- `docs/spikes/phase-1-tags.md`
- `docs/spikes/s2-mac-attempt-2.json`
- `docs/spikes/s2-xiaomi-note13-attempt-1.json`
- `docs/spikes/task-report-2026-11-15.md`
- `docs/test-matrix.md`
- `eslint.config.mjs`
- `package.json`
- `packages/core/README.md`
- `packages/core/package.json`
- `packages/core/src/config.ts`
- `packages/core/src/index.ts`
- `packages/core/src/tag.ts`
- `packages/core/tag.test.ts`
- `packages/core/tsconfig.json`
- `packages/test-vectors/README.md`
- `packages/test-vectors/tags.json`
- `playwright.config.ts`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tools/check-licenses.mjs`
- `tools/check-vectors.mjs`
- `tools/foundations.acceptance.mjs`
- `tools/foundations.test.ts`
- `tools/offline.browser.test.ts`
- `tools/spikes/README.md`
- `tools/spikes/index.html`
- `tools/spikes/probe.ts`
- `tools/spikes/tsconfig.json`
- `tools/verify-vectors.py`
- `tsconfig.json`
- `vitest.config.ts`
