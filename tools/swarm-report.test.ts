import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import type { SwarmConfig, SwarmResult } from '../packages/sim/src/index.js';

interface Run { scenario: string; config: SwarmConfig; result: Omit<SwarmResult, 'neighbors'>; max_peer_degree: number }
interface Summary { scenario: string; clients: number; completed: number; expected: number;
  median_ms: number | null; p95_ms: number | null; mean_seed_bytes: number }
interface Report { model_sha256: string; seeds: number[]; runs: Run[]; summaries: Summary[] }

it('S6-REPORT preserves all client outcomes and matches the compiled model and summary arithmetic', async () => {
  const report = JSON.parse(await readFile(new URL('../docs/spikes/S-6-swarm-load.json', import.meta.url), 'utf8')) as Report;
  const model = await readFile(new URL('../packages/sim/dist/index.js', import.meta.url));
  expect(createHash('sha256').update(model).digest('hex')).toBe(report.model_sha256);
  expect(report.runs).toHaveLength(75);
  expect(report.summaries).toHaveLength(15);
  for (const run of report.runs) {
    const { result, config } = run;
    expect(result.completionMs).toHaveLength(config.clients);
    expect(result.receivedChunks).toHaveLength(config.clients);
    expect(result.completed).toBe(result.completionMs.filter((time) => time !== null).length);
    expect(result.receivedBytes).toBe(result.receivedChunks.reduce((sum, chunks) => sum + chunks * config.chunkBytes, 0));
    expect(result.seedBytes + result.peerBytes).toBe(result.receivedBytes + result.duplicateBytes + result.droppedBytes + result.inFlightBytes);
    expect(result.peakInFlight).toBeLessThanOrEqual(65_536);
    expect(result.peakSeedBytesPerTick).toBeLessThanOrEqual(config.seedBytesPerSecond * config.tickMs / 1000);
    expect(result.peakPeerBytesPerTick).toBeLessThanOrEqual(config.peerBytesPerSecond * config.tickMs / 1000);
    expect(result.peakDownloadBytesPerTick).toBeLessThanOrEqual(config.downloadBytesPerSecond * config.tickMs / 1000);
    expect(run.max_peer_degree).toBeLessThanOrEqual(config.peerDegree);
    if (config.mode === 'web-seed-only') expect(result.peerBytes).toBe(0);
  }
  for (const summary of report.summaries) {
    const runs = report.runs.filter((run) => run.scenario === summary.scenario && run.config.clients === summary.clients);
    expect(runs.map((run) => run.config.seed)).toEqual(report.seeds);
    const times = runs.flatMap((run) => run.result.completionMs).map((time) => time ?? Infinity).sort((a, b) => a - b);
    const middle = times.length / 2;
    const median = ((times[middle - 1] ?? Infinity) + (times[middle] ?? Infinity)) / 2;
    const p95 = times[Math.ceil(times.length * 0.95) - 1] ?? Infinity;
    expect(summary.median_ms).toBe(Number.isFinite(median) ? median : null);
    expect(summary.p95_ms).toBe(Number.isFinite(p95) ? p95 : null);
    expect(summary.completed).toBe(runs.reduce((sum, run) => sum + run.result.completed, 0));
    expect(summary.expected).toBe(summary.clients * report.seeds.length);
    expect(summary.mean_seed_bytes).toBe(runs.reduce((sum, run) => sum + run.result.seedBytes, 0) / runs.length);
  }
});
