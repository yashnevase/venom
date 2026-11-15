# S-4 saved single-file capability experiment

Measured on 2026-11-15 on a Mac arm64 running macOS 26.1 (25B78). Source base
5ed061f, Node 24.11.0. The experiment is an early spike from docs/05 section 2.
Phase 1 encryption remains gated by ADR 002 and ADR 008.

## Method

The generated HTML has an inline module, inline CSS, a data favicon and the
Apache license. It exercises Ed25519, X25519, HKDF-SHA256, AES-256-GCM,
HMAC-SHA256 and SHA-256 with public fixture data and ephemeral in-memory keys.
It writes a public scratch token to `openmesh-s4-diagnostic-v1`, reads the
previous token, commits a new token and closes the database. It also attempts
to fetch its own file URL. Removal deletes that scratch database.

Each browser uses its own temporary persistent profile, offline mode and an
HTTP(S) request recorder. Six observations cover the original path, reload,
renamed copy, copy in a different directory, return to the original, and a
browser restart using the same profile. Profiles are removed after closure.
Both runs requested `chromiumSandbox` through Playwright. Browser launch
arguments were not independently inspected. All runs used headless automation.

The full HTML is 20802 bytes. Its SHA-256 is
`f3f0f2b8aaea732376860921bda734ecd64e7ba0493bf3525156a69a705580bb`.
The saved raw report includes source-base commit and artifact hash, since this
measurement precedes the commit that adds the experiment.

## Observed matrix

| Browser and context | Native exercises | Scratch storage | Source fetch | HTTP(S) requests |
|---|---|---|---|---|
| Bundled Chromium 159.0.8154.6, file URLs | 36 of 36 supported | Round trips, reload and browser restart retained tokens | TypeError in all six cases | 0 |
| Installed Chrome 157.0.8103.52, file URLs | 36 of 36 supported | Round trips, reload and browser restart retained tokens | TypeError in all six cases | 0 |
| Safari 26.1 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Xiaomi Note 13, Android 16 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| iPhone and older Android | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |

All 12 file-page observations reported a secure context. Within each tested
browser profile, the renamed and different-directory copies read the preceding
copy's scratch token. The three tested paths shared this database namespace.
These observations cover the specified scratch database and paths. Broader
file-origin isolation and production identity storage require separate tests.

Safari WebDriver returned `session not created` because Allow remote automation
was disabled. Computer Use returned `Computer Use was not approved to use Safari`.
The approval response supplied no further reason. The preference was left as
observed and the temporary driver listener was closed. Safari remains unverified.
The exact observations are in `S-4-safari-access.json`.

## Provisional saved-copy UX decision

Use the existing static HTTPS installation context in docs/03 for the initial
app. A saved single-file distribution still requires the reviewed app, mobile
opening tests and a trusted signed release-hash workflow before offering it as
an identity-bearing installation. Recovery entry remains limited to the official
installation as required by docs/06.

Keep a full-artifact SHA-256 alongside this diagnostic for external comparison.
The tested pages could not read their own source through fetch, so an app-visible
fingerprint requires an explicit design and verification step. S4-HASH-BUILD
measures an external digest comparison. SEC-7 and the full S-4 gate remain open.

## Acceptance and verification

Acceptance tests were written before the artifact existed and failed on that
missing artifact. S4-INDEPENDENT then exposed a diagnostic bug where the scratch
token required crypto availability. The token now uses an ordinary public test
value. All three browser acceptance tests and the artifact-hash test pass.

- S4-FILE checks six native exercises, offline file reload, scratch read/write,
  removal and subsequent absence of the old token, and zero HTTP(S) requests.
- S4-DENIAL checks unavailable crypto and IndexedDB produce observations and
  allow the diagnostic to complete.
- S4-INDEPENDENT checks scratch storage when crypto is unavailable.
- S4-HASH-BUILD checks the complete artifact hash, a changed title's different
  hash, and absence of external script source attributes.
- S4-MAC records the two desktop-browser profiles and their six cases each.

No dependencies were added. This experiment adds diagnostic scratch storage.
Production storage and protocol APIs remain pending their phase gates.

## Task report

Task S-4 saved-copy capability spike. Phase 1 branch, early-spike scope.
The containing commit supplies the task commit identifier.

Tests run comprise S4-FILE, S4-DENIAL, S4-INDEPENDENT and S4-HASH-BUILD, all four
passing. The full local suite passed one foundation test, 53 Vitest tests and
10 browser tests, plus 79 independent vector checks. Strict types, build, lint,
138 installed-package license checks, audit and whitespace checks passed.
The audit reported zero known vulnerabilities. CI is reported with the commit.
Measured results comprise 72 native exercises, 12 scratch round trips, token
retention across reload and browser restart in two profiles, zero HTTP(S)
requests, and 12 source-fetch TypeErrors.

Not verified on a real device includes Android/iPhone local-file opening and
storage, content-URI routing, Safari, ordinary graphical opening, long retention
and eviction, battery, production identity persistence, encrypted backup and
Box flows. The earlier Xiaomi compression result measures a different feature.

Claims-ledger rows added cover S4-FILE/S4-MAC, S4-DENIAL/S4-INDEPENDENT,
S4-HASH-BUILD, S4-SOURCE-FETCH and S4-SAFARI-ACCESS. Known problems comprise
shared scratch namespaces on the three tested paths, unavailable self-fetch,
the Safari access restriction, missing phone observations and pending full-app
integrity UX. The provisional installation decision above uses existing policy.

Files changed comprise the root package build script, the spike TypeScript
configuration and README, this report, the two raw observation files,
`docs/test-matrix.md`, `docs/claims-ledger.md`, the probe and HTML template,
`tools/stage-saved-copy-spike.mjs`, `tools/run-saved-copy-spike.mjs`,
`tools/saved-copy.test.ts` and `tools/saved-copy.browser.test.ts`.
