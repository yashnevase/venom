# venom

Experimental, not independently reviewed.

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
python3 -m venv /tmp/openmesh-vector-env
/tmp/openmesh-vector-env/bin/python -m pip install -r tools/vectors/requirements.txt
OPENMESH_VECTOR_PYTHON=/tmp/openmesh-vector-env/bin/python pnpm check
pnpm audit --audit-level=low
```

Phase 1 now includes experimental envelope, file-stream and Receipt APIs using
docs/04 revision 2. The complete Phase 1 gate remains pending. External review
gates public release, security promises and Gate E under the owner amendment.
Phase status, measurements,
and unverified work are recorded in `docs/spikes/phase-0.md`,
`docs/spikes/phase-1-tags.md`, and `docs/claims-ledger.md`.

The standalone S-2 diagnostic instructions are in `tools/spikes/README.md`.

Reference code is Apache-2.0 under `LICENSE`. The protocol specification is
dedicated under CC0-1.0 in `docs/LICENSE`.
