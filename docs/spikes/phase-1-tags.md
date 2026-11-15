# Phase 1 Tag record

## Scope

The owner chose to keep encryption gated for review on 2026-11-14. ADR 002 lists
the unresolved envelope, streaming AEAD and recovery decisions. Phase 1 is
partial. This change implements the independently specified Tag module in core.

## Red then green

The Tag acceptance test was written before source code. Its initial Vitest run
failed because src/tag.js did not exist. After implementation, all 6 Tag tests
passed, plus the Phase 0 smoke test. `pnpm check` passes strict types, typed lint,
the ESM build, 1 foundation acceptance test, 7 Vitest tests, the independent
Python verifier and the license check.

## Measurements

Mac arm64, Node 24.11.0, WebCrypto HMAC-SHA256, no networking.
8 JSON vectors passed in both TypeScript and Python. 256 deterministic inputs
also matched Node's independent HMAC API. Tests cover counter limits, the 64-tag
window, key changes, clock skew and unavailable WebCrypto. The built ESM entry
point was imported in Node and returned a 16-byte tag. The observed Vitest run
took 81 ms for 7 tests.

## Assumptions

Interpret u64 as big-endian and K_tag as a 256-bit HKDF output. These choices are
recorded in ADR 002 pending protocol freeze. Counter resync remains D-6.

## Unverified

No Tag checks ran on a real phone. Identity, seal/open, receipts, small/chunked
profiles, compression, padding, parser fuzzing and their conformance vectors
remain gated. The Phase 1 gate has not passed. No production carrier exists, so
SC-10 multi-carrier chaos remains a later gate.
