# 001 — Foundation tooling

## Status

Adopted for Phase 0 on 2026-11-14 under docs/05 section 1.

## Problem

The extracted project contains specifications and requires the prescribed build tools.

## Options

Use the documented TypeScript, pnpm, Vitest, ESLint, and Playwright toolchain.
Native Node tests provide the initial acceptance check before dependencies exist.

## Recommendation

Pin development dependencies and commit the lockfile. Use Node 24.11.0 and
pnpm 11.25.0. TypeScript 5.9.3 is within typescript-eslint's declared peer range
of >=4.8.4 <6.1.0. Protocol code has zero runtime dependencies in Phase 0.

| Dependency | Version | Purpose | Registry unpacked bytes | License |
|---|---|---|---|---|
| typescript | 5.9.3 | strict type checking | 23625066 | Apache-2.0 |
| vitest | 5.1.0 | Node tests | 2878460 | MIT |
| eslint | 10.15.0 | lint | 2958806 | MIT |
| @eslint/js | 10.0.1 | lint rule configuration | 15687 | MIT |
| typescript-eslint | 8.72.2 | typed linting | 42686 | MIT |
| @playwright/test | 1.65.1 | browser experiment tests | 28542 | Apache-2.0 |
| @types/node | 24.11.0 | Node type definitions | 2524555 | MIT |

Registry metadata was queried with npm view on 2026-11-14. These sizes exclude
transitive packages. Compressed package sizes and the installed inventory are
recorded with the final measurement report. No independent audit of these
specific versions has been established. Dependency advisory and license checks
run locally and in CI. Advisory status is a dated observation.

## Verification

P0-ACCEPTANCE must fail before configuration exists, then pass. P0-SMOKE is the
empty Vitest gate. Remote CI execution requires a GitHub repository and push.
First-load bundle budgeting starts when an app bundle exists in Phase 2.

## Transitive dependency review

The initial audit reported GHSA-g3hv-75wg-m249 in minimatch 10.2.6, pulled in by
typescript-eslint. Override that exact version to the already-installed 11.0.8
(BlueOak-1.0.0). The consuming code calls `minimatch(path, pattern, { dot: true })`,
which remains available. Strict lint is the exercised integration path. Record
the override until typescript-eslint updates its dependency.
The advisory and upstream breaking changes were checked against their primary sources.
[Advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249).
[Upstream changelog](https://github.com/isaacs/minimatch/blob/main/changelog.md).

Vitest's Vite dependency includes lightningcss and its platform binding under
MPL-2.0. They are unmodified development tools. Their declared file-level license
is accepted for that use. No runtime application bundle exists yet.

pnpm generated minimumReleaseAgeExclude entries for exact resolved tooling
versions during installation. These entries are retained with the frozen lockfile
and are part of this dependency review.
