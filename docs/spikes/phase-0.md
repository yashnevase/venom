# Phase 0 record

## Inputs

The owner confirmed on 2026-11-14 that the files already extracted into the
project came from openmesh_docs_v3.zip. The archive itself was absent. The
historical v2 heading in 00_START_HERE.md is preserved. `Docs` was renamed to
`docs` through an intermediate name for case-insensitive macOS filesystems.
Root AGENTS.md matched the extracted copy. Original research is preserved.

## Red then green

P0-ACCEPTANCE was written first and run with `node --test`. It failed with ENOENT
for the missing package.json, 0 passed and 1 failed. After implementation,
`pnpm check` passed with P0-ACCEPTANCE and P0-SMOKE, 2 passed and 0 failed.
Strict TypeScript and typed ESLint passed. Vector count is 0 for the empty
Phase 0 foundation. Phase 1 conformance remains pending.

## Measurements

Mac arm64, Node 24.11.0, pnpm 11.25.0. Latest local run on 2026-11-14 used
31.48 ms for the Node acceptance runner and 63 ms for the Vitest smoke runner.
These timings are observations for the empty setup.

135 installed package licenses checked. `pnpm audit --audit-level=low --json`
reported 0 vulnerabilities across 165 locked dependencies after the minimatch
override described in ADR 001. Initial audit found 1 moderate advisory.

Compressed archive sizes measured from registry downloads, excluding transitive
dependencies, were as follows.

| Package | Compressed bytes | Unpacked bytes |
|---|---|---|
| typescript 5.9.3 | 4377468 | 23625066 |
| vitest 5.1.0 | 727875 | 2878460 |
| eslint 10.15.0 | 631085 | 2958806 |
| @eslint/js 10.0.1 | 4193 | 15687 |
| typescript-eslint 8.72.2 | 9372 | 42686 |
| @playwright/test 1.65.1 | 8742 | 28542 |
| @types/node 24.11.0 | 459012 | 2524555 |
| minimatch 11.0.8 | 121657 | 501013 |

## Device coverage

No camera, storage, or networking feature has been verified on a real phone.
The owner has a Xiaomi Note 13. Android SDK adb is absent from PATH. Xcode's
xctrace device-list utility is unavailable. S-2 needs a manual phone operator.

## Remote CI

The first remote run for commit 9bb267a succeeded on GitHub Actions.
[Run 43625101784](https://github.com/yashnevase/venom/actions/runs/43625101784).
