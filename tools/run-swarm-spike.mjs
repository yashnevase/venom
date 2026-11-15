import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { simulateSwarm } from '../packages/sim/dist/index.js';
import { chunkSizeForFile } from '../packages/core/dist/index.js';

const MiB = 1024 * 1024;
const chunk = chunkSizeForFile(16 * MiB);
if (!chunk.ok) throw new Error('Chunk selection failed');
const seeds = [0x53360001, 0x53360002, 0x53360003, 0x53360004, 0x53360005];
const base = {
  fileBytes: 16 * MiB, chunkBytes: chunk.value, tickMs: 250, latencyMs: 100,
  durationMs: 4_000_000, seedBytesPerSecond: 8 * MiB,
  peerBytesPerSecond: MiB, downloadBytesPerSecond: 4 * MiB, peerDegree: 8,
  churnPeriodMs: 10_000, stopPeerPathsAtMs: null,
};
const scenarios = [
  { name: 'web-seed-only', mode: 'web-seed-only', offlineMs: 0, lossRate: 0,
    blockedPeerRate: 0, leaveAfterCompleteMs: null },
  { name: 'swarm-foreground', mode: 'swarm', offlineMs: 0, lossRate: 0,
    blockedPeerRate: 0, leaveAfterCompleteMs: null },
  { name: 'web-seed-churn', mode: 'web-seed-only', offlineMs: 2000, lossRate: 0.01,
    blockedPeerRate: 0.2, leaveAfterCompleteMs: null },
  { name: 'swarm-churn', mode: 'swarm', offlineMs: 2000, lossRate: 0.01,
    blockedPeerRate: 0.2, leaveAfterCompleteMs: null },
  { name: 'swarm-churn-leave', mode: 'swarm', offlineMs: 2000, lossRate: 0.01,
    blockedPeerRate: 0.2, leaveAfterCompleteMs: 0 },
];

// Missing completions sort after every observed completion and retain null percentiles.
function quantile(values, probability) {
  const ordered = values.map((value) => value ?? Infinity).sort((a, b) => a - b);
  const index = Math.ceil(ordered.length * probability) - 1;
  if (probability === 0.5 && ordered.length % 2 === 0) {
    const middle = (ordered[index] + ordered[index + 1]) / 2;
    return Number.isFinite(middle) ? middle : null;
  }
  return Number.isFinite(ordered[index]) ? ordered[index] : null;
}

const runs = [];
const summaries = [];
const rssBefore = process.memoryUsage().rss;
let sampledRssMax = rssBefore;
for (const scenario of scenarios) {
  const { name, ...parameters } = scenario;
  for (const clients of [50, 500, 1000]) {
    const group = [];
    for (const seed of seeds) {
      const config = { ...base, ...parameters, clients, seed };
      const started = performance.now();
      const result = simulateSwarm(config);
      const wallMs = performance.now() - started;
      sampledRssMax = Math.max(sampledRssMax, process.memoryUsage().rss);
      if (result.seedBytes + result.peerBytes !== result.receivedBytes + result.duplicateBytes
        + result.droppedBytes + result.inFlightBytes) throw new Error(`Byte accounting failed for seed ${seed}`);
      if (result.receivedBytes !== config.fileBytes * result.completed && result.completed === clients) {
        throw new Error(`Completion accounting failed for seed ${seed}`);
      }
      const { neighbors, ...metrics } = result;
      const row = { scenario: name, config, result: metrics, wall_ms: wallMs,
        max_peer_degree: Math.max(...neighbors.map((peers) => peers.length)),
        topology_sha256: createHash('sha256').update(JSON.stringify(neighbors)).digest('hex') };
      group.push(row);
      runs.push(row);
    }
    const completion = group.flatMap((run) => run.result.completionMs);
    const summary = { scenario: name, clients, trials: group.length,
      completed: group.reduce((sum, run) => sum + run.result.completed, 0), expected: clients * seeds.length,
      median_ms: quantile(completion, 0.5), p95_ms: quantile(completion, 0.95),
      mean_seed_bytes: group.reduce((sum, run) => sum + run.result.seedBytes, 0) / group.length,
      mean_seed_bytes_per_second: group.reduce((sum, run) => sum
        + run.result.seedBytes / (run.result.simulatedMs / 1000), 0) / group.length,
      mean_peer_bytes: group.reduce((sum, run) => sum + run.result.peerBytes, 0) / group.length,
      mean_dropped_bytes: group.reduce((sum, run) => sum + run.result.droppedBytes, 0) / group.length,
      mean_duplicate_bytes: group.reduce((sum, run) => sum + run.result.duplicateBytes, 0) / group.length,
      max_in_flight: Math.max(...group.map((run) => run.result.peakInFlight)),
      wall_ms: group.reduce((sum, run) => sum + run.wall_ms, 0),
    };
    summaries.push(summary);
    console.log(JSON.stringify(summary));
  }
}
const rssAfter = process.memoryUsage().rss;
const report = { test: 'S-6-model', measured_at: new Date().toISOString(),
  source_base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version, platform: process.platform, arch: process.arch,
  sampled_rss_before: rssBefore, sampled_rss_max: Math.max(sampledRssMax, rssAfter), sampled_rss_after: rssAfter,
  model_sha256: createHash('sha256').update(await readFile('packages/sim/dist/index.js')).digest('hex'),
  seeds, percentile_method: 'pooled client observations; median averages middle pair, p95 nearest rank; missing = infinity',
  summaries, runs };
await writeFile('docs/spikes/S-6-swarm-load.json', JSON.stringify(report, null, 2) + '\n');
