# OpenMesh Doc Set v2 — START HERE

Working codename for the product: **Venom** (or OpenChat). Protocol name: **OpenMesh Protocol**.
Both product names collide with existing well-known things (a Marvel character, other projects named Venom/OpenChat). Fine as a code name. Check trademarks before any public launch. Keep the name in ONE constant (`APP_NAME`) so renaming is cheap.

## What this set is
Doc 1 (`openmesh_master_research.md`) = the vision and research. KEEP IT UNCHANGED as history.
This set (Doc 2) = the buildable spec. Where the two disagree, **Doc 2 wins**. Every disagreement is listed in `01_DOC1_REVIEW_AND_CORRECTIONS.md` with the reason.

## Files
| File | Read it when |
|---|---|
| `AGENTS.md` | Put at repo root. Every AI/Codex session reads it FIRST. |
| `01_DOC1_REVIEW_AND_CORRECTIONS.md` | To see what Doc 1 missed or got wrong, and why. |
| `02_PRODUCT_AND_SCOPE.md` | Who it is for, what v1 is, what is deliberately NOT in v1. |
| `03_ARCHITECTURE.md` | Layers, packages, carriers, platforms, storage, load model. |
| `04_PROTOCOL_DRAFT.md` | Exact Box / Tag / Receipt formats, crypto suite, open decisions. |
| `05_BUILD_PLAN.md` | Repo layout, phases, acceptance tests, spikes, prompt template for Codex. |
| `06_PRIVACY_SECURITY_LEGAL.md` | Threat model, Tor mode, supply-chain risk, legal cautions. |
| `07_LATER_ROADMAP.md` | Communities, load-heavy publishing, channels, audio/video, ads. |
| `08_RESEARCH_AND_LINKS.md` | Sources. Marks which links were actually checked. |
| `09_ENGINEERING_TECHNIQUES.md` | The small techniques that make the system strong (20 of them), with the phase each lands in. Includes the math on helper availability. |
| `10_TEST_STRATEGY.md` | How every claim is proven: claim ledger, test levels, simulation scenarios, device lab, spikes S-7..S-10, release gates. |
| `11_DATA_MODEL_AND_ALGORITHMS.md` | Record shapes, tables, size budget, state machines, pseudocode, quotas, defaults. |

Docs 09–11 are "Doc 3". Doc 1 = vision, Doc 2 = docs 00–08, Doc 3 = docs 09–11. If they disagree: AGENTS.md, then 11, 10, 09, then 04, 03, and the rest. Doc 1 loses to all of them.

## How to use with Codex (or any AI)
1. Create the repo. Copy `AGENTS.md` to the root, all docs into `/docs` (including Doc 1).
2. For EACH session give the AI: `AGENTS.md` + `03_ARCHITECTURE.md` + `04_PROTOCOL_DRAFT.md` + ONE phase from `05_BUILD_PLAN.md`. Nothing more.
3. One phase = one branch = one pull request. The phase's acceptance test must pass before moving on.
4. Test on real phones, not only your Mac (rule in `AGENTS.md`).
5. When the AI wants to change the architecture, it must write a short decision record (ADR) in `/docs/adr` and wait for you.

## Status labels used in these docs
- **DECIDED** — build it this way.
- **TARGET** — a goal to measure, not a fact.
- **SPIKE** — unproven; run the small experiment in `05_BUILD_PLAN.md` before depending on it.
- **UNVERIFIED** — a claim from a source I could not confirm. Do not repeat it publicly.
- **LATER** — valuable, explicitly not in v1.

## Honest summary
You have a strong design and no product yet. The goal of v1 is NOT to impress with architecture. It is: **10 real people use it a second time, unprompted, within a week.** Everything in these docs is arranged to reach that test quickly.
