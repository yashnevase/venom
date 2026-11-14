# Protocol core

Phase 1 currently contains the Tag module. Encryption, identity, receipts and
chunked profiles await the decisions in `docs/adr/002-phase-1-envelope-decisions.md`.
The owner explicitly kept encryption gated for review on 2026-11-14.

## API

```ts
import { deriveTag, deriveTagWindow } from '@openmesh/core';

const result = await deriveTag(tagKey, 0n);
if (result.ok) {
  // result.value is the 16-byte tag.
}
const window = await deriveTagWindow(tagKey, 0n);
```

`tagKey` is a 32-byte Uint8Array supplied by the caller. The counter is an
unsigned 64-bit bigint encoded big-endian. Both interpretations are recorded in
ADR 002 pending protocol freeze. The caller maintains per-direction secrets and
counters. `deriveTagWindow` returns 64 tags. Counter exhaustion returns a typed
error. A resync beacon awaits D-6.

## Verification

```sh
pnpm --filter @openmesh/core build
pnpm exec vitest run packages/core/tag.test.ts
pnpm test:vectors
```

Measurements and device coverage are in `docs/spikes/phase-1-tags.md`. Public
claims are tracked in `docs/claims-ledger.md`.
