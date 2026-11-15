# S-6 swarm load model

An early discrete-time experiment from docs/05 section 2. `simulateSwarm(config)`
returns per-client completion times, piece counts, topology and byte accounting.
The module uses seeded xorshift32 randomness and virtual time. Required inputs
are defined by `SwarmConfig` in src/index.ts. Units are bytes, milliseconds and
bytes per second. The scenario runner supplies every input explicitly.

Clients track held and in-flight opaque chunk indices. Local neighborhoods have
at most eight peer links, plus a web-seed path. Whole-chunk service slots limit
each endpoint's total upload and download. Delivery follows a service slot and
rounded latency. A blocked edge stays blocked. Periodic downtime retains
completed pieces and drops affected in-flight transfers. The experiment can
remove all peer paths or make clients leave as soon as their downloads finish.

T7's sequential/local-rarest-first ordering and a two-source final-piece request
are experiment policies described in ADR 009. Source choice is seeded among
currently available sources. The result counts unique received, duplicate,
dropped and still-in-flight bytes separately. Zero supply leaves null completion
times. The runner includes missing completions when calculating percentiles.

## Limits

Inputs must use integer time slots and whole-chunk service budgets. Invalid
inputs throw RangeError before allocation. The caps are 1000 clients, 1048576
client/chunk cells, 65536 simultaneous transfers, eight peer neighbors and
20000 simulation ticks. Chunk sizes use the three sizes in docs/11. The runner
uses core's existing chunk-size selection for its 16 MiB fixture.

This model allocates metadata. Payload hashing, encryption, wire frames, discovery,
congestion control, real Carrier integration and real-device costs remain pending.
The measured input capacities and churn schedules are synthetic assumptions.
Gate C requires the corresponding result with real code.

## Reproduce

From the project root, run the following commands.

```sh
pnpm build
pnpm exec vitest run packages/sim/swarm.test.ts tools/swarm-report.test.ts
node tools/run-swarm-spike.mjs
```

The last command overwrites docs/spikes/S-6-swarm-load.json with all 75 runs.
Numerical outcomes replay exactly for the same model and seeds. Host timing,
sampled RSS, source-base identifier and measurement date describe each execution.
The saved report test also checks the compiled model hash and summary arithmetic.

Optional chart rendering uses `python tools/plot-swarm-spike.py` in an external
Python environment containing Matplotlib 3.10.8. ADR 009 and the saved plotting
environment record cover its version, size, license metadata and advisory query.
The chart is committed under docs/spikes. The numerical model adds zero external
package dependencies. The report lists device gaps and complete test results.
