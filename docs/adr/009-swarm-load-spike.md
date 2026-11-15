# 009 — Isolated S-6 load model and chart tooling

## Status

Accepted for the early S-6 experiment required by docs/05 section 2. Production
adoption follows the phase schedule in docs/09. Phase 1 and D-8 remain gated.

## Problem

S-6 requires seeded 50/500/1000-client simulations, churn, median/p95 download
times and web-seed bandwidth. Complete encrypted Boxes and real carriers await
the protocol review. A reproducible metadata model can test load assumptions
while those integrations remain pending.

## Options and decision

Use a bounded discrete-time experiment in packages/sim. Compare a web-seed-only
control with active downloaders sharing opaque chunk indices over at most eight
peer links and one web-seed link each. Graphs combine shuffled undirected cycles.
Fixed blocked edges model unreachable peer pairs. Churn phases are independently
seeded. Committed pieces survive downtime. Completed clients either remain
foregrounded for the experiment or leave immediately, depending on the scenario.

The model uses T7's sequential selection for small neighborhoods and local
rarest-first for larger neighborhoods. Equal-rarity order and source selection
are seeded. The final missing chunk may be requested from one peer and the web
seed, subject to both endpoints' service budgets. Duplicate bytes are counted.
No future reachability information is available to the requester.

The initial regression showed persistent tail starvation under periodic churn
when a requester always preferred a peer over the web seed. The regression uses
seed 0x53360001. The corrected model uses seeded source selection and the
bounded final-piece request. These are explicit experiment policies.

Each service slot accounts for a whole chunk. Delivery occurs after one service
tick plus latency rounded up to ticks. Upload/download budgets are per endpoint
and shared across its requests. Failures discard in-flight bytes. Subsequent
ticks request missing pieces. This is the experiment's demand process.
Application retry policy remains the policy specified in docs/11.

The measured scenarios use a 16 MiB file, docs/11's 64 KiB chunks, 250 ms ticks,
100 ms configured latency, an 8 MiB/s web seed, 1 MiB/s peer upload and 4 MiB/s
client download. They compare foreground sharing, periodic downtime with
whole-transfer loss and blocked links, and immediate departure after completion. The report
gives every parameter and seed. These values are synthetic inputs.

State is capped at 1000 clients, 1048576 client/chunk cells, 65536 in-flight
transfers and 20000 ticks. The simulator allocates metadata for chunk indices.
Payload bytes, cryptography, framing, real discovery, congestion control,
transport overhead and browser resource costs await real-stack integration.
S6-CHAOS removes all virtual peer paths while the web seed survives. SC-10's
multi-carrier application test and Gate C's real-code proof remain pending.

## Chart dependency budget

Use Matplotlib 3.10.8 only in a temporary external Python 3.11 environment to
render the required standalone chart from the saved JSON. This adds zero npm
or application dependencies. The reproducible chart script is optional tooling
and the numerical experiment runs with the existing Node toolchain.

Matplotlib's published license is PSF-based. Its CPython 3.11 macOS arm64 wheel
is 8139625 bytes. Eleven installed distributions total 70012741 file bytes,
including transitive libraries. S-6-plot-environment.json records exact versions,
license metadata and sizes. The OSV exact-version advisory query returned zero
findings on 2026-11-15. No independent security audit of this plotting environment
has been established. It processes the locally generated diagnostic JSON.
The temporary environment is removed after rendering.
[Release metadata](https://pypi.org/pypi/matplotlib/3.10.8/json)

## Verification

Write acceptance tests before the module. Require deterministic replay, bounded
neighborhoods, byte conservation including failed/duplicate/in-flight bytes,
service limits, latency, zero-supply timeout, churn and peer-path loss. Publish
all client outcomes and every run's seed. Missing clients count as incomplete
when computing percentiles. Report model findings and real-device gaps in S-6.
