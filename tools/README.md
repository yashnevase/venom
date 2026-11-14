# Development tools

## Phase 1 capability measurement

Run the native API probe on the pinned Node runtime.

```sh
node tools/crypto-capabilities.ts
pnpm exec vitest run tools/crypto-capabilities.test.ts
```

The probe exercises the six algorithms listed in docs/04 and outputs a local
JSON observation with timing and check names. Its ephemeral asymmetric private
keys are non-extractable. The output contains measurement metadata. Each
algorithm failure is reported independently and produces a failing CLI exit
status. Timings cover one exercise per algorithm, including setup and checks.

These are native-API capability observations. Phase 1 envelope and streaming
decisions are tracked in docs/adr/002-phase-1-envelope-decisions.md. P1-CAP results
and real-device coverage are in docs/spikes/phase-1-crypto-review.md and the
claims ledger.

## Existing tools

Foundation acceptance runs with `pnpm test:foundations`. The independent protocol
vector verifier runs with `pnpm test:vectors`, and the installed-license check
runs with `pnpm check:licenses`. S-2 diagnostic instructions are in
tools/spikes/README.md.
