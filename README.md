# venom

OpenMesh reference project.

Working product codename is maintained in `packages/core/src/config.ts` once
Phase 1 starts. Project instructions are in `AGENTS.md`. Specifications and the
original research document are in `docs/`. The owner confirmed that the supplied
extracted files came from openmesh_docs_v3.zip. Their historical v2 heading is
preserved verbatim.

## Development

Use Node 24.11.0 and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm audit --audit-level=low
```

Phase 0 passed local checks and GitHub CI. Phase 1 currently contains Tag,
deterministic CBOR and chunk-integrity modules, with encryption gated for review
by the owner.
Phase status, measurements,
and unverified work are recorded in `docs/spikes/phase-0.md`,
`docs/spikes/phase-1-tags.md`, and `docs/claims-ledger.md`.

The standalone S-2 diagnostic instructions are in `tools/spikes/README.md`.

Reference code is Apache-2.0 under `LICENSE`. The protocol specification is
dedicated under CC0-1.0 in `docs/LICENSE`.
