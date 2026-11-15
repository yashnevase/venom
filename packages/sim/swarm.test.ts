import { expect, it } from 'vitest';
import { simulateSwarm, type SwarmConfig } from './src/index.js';

const KiB = 1024;
const base: SwarmConfig = {
  seed: 0x53360001, clients: 12, fileBytes: 512 * KiB, chunkBytes: 64 * KiB,
  tickMs: 250, latencyMs: 100, durationMs: 60_000,
  seedBytesPerSecond: 4 * 1024 * KiB, peerBytesPerSecond: 1024 * KiB,
  downloadBytesPerSecond: 4 * 1024 * KiB, peerDegree: 8,
  mode: 'swarm', churnPeriodMs: 10_000, offlineMs: 0,
  lossRate: 0, blockedPeerRate: 0, leaveAfterCompleteMs: null,
  stopPeerPathsAtMs: null,
};

it('S6-REPLAY repeats the seed exactly and keeps peer neighborhoods bounded', () => {
  const first = simulateSwarm(base);
  expect(simulateSwarm(base)).toEqual(first);
  expect(simulateSwarm({ ...base, seed: base.seed + 1 }).neighbors).not.toEqual(first.neighbors);
  for (const [client, neighbors] of first.neighbors.entries()) {
    expect(neighbors.length).toBeLessThanOrEqual(base.peerDegree);
    expect(new Set(neighbors).size).toBe(neighbors.length);
    expect(neighbors).not.toContain(client);
    for (const peer of neighbors) expect(first.neighbors[peer]).toContain(client);
  }
});

it('S6-ACCOUNT completes opaque pieces with conserved bytes and bounded service budgets', () => {
  const result = simulateSwarm(base);
  expect(result.completed).toBe(base.clients);
  expect(result.receivedBytes).toBe(base.clients * base.fileBytes);
  expect(result.seedBytes + result.peerBytes).toBe(result.receivedBytes + result.duplicateBytes + result.droppedBytes + result.inFlightBytes);
  expect(result.peerBytes).toBeGreaterThan(0);
  expect(result.peakPeerBytesPerTick).toBeLessThanOrEqual(base.peerBytesPerSecond * base.tickMs / 1000);
  expect(result.peakSeedBytesPerTick).toBeLessThanOrEqual(base.seedBytesPerSecond * base.tickMs / 1000);
  expect(result.peakDownloadBytesPerTick).toBeLessThanOrEqual(base.downloadBytesPerSecond * base.tickMs / 1000);
  expect(result.completionMs.every((time) => time !== null && time > 0)).toBe(true);
});

it('S6-TIME accounts for a service slot and rounded latency before making pieces available', () => {
  const result = simulateSwarm({ ...base, clients: 1, fileBytes: 64 * KiB });
  expect(result.completionMs).toEqual([500]);
  expect(result.seedBytes).toBe(64 * KiB);
  expect(result.peerBytes).toBe(0);
});

it('S6-CHURN preserves completed pieces through downtime and accounts for failed flights', () => {
  const result = simulateSwarm({ ...base, fileBytes: 2 * 1024 * KiB,
    churnPeriodMs: 2000, offlineMs: 750, lossRate: 0.05, blockedPeerRate: 0.3 });
  expect(result.completed).toBe(base.clients);
  expect(result.droppedBytes).toBeGreaterThan(0);
  expect(result.receivedBytes).toBe(base.clients * 2 * 1024 * KiB);
  expect(result.seedBytes + result.peerBytes).toBe(result.receivedBytes + result.duplicateBytes + result.droppedBytes + result.inFlightBytes);
});

it('S6-CHAOS loses every peer path during transfer and finishes through the web seed', () => {
  const result = simulateSwarm({ ...base, fileBytes: 2 * 1024 * KiB, stopPeerPathsAtMs: 750 });
  expect(result.completed).toBe(base.clients);
  expect(result.peerBytes).toBeGreaterThan(0);
  expect(result.droppedBytes).toBeGreaterThan(0);
  expect(result.receivedBytes).toBe(base.clients * 2 * 1024 * KiB);
  const control = simulateSwarm({ ...base, mode: 'web-seed-only' });
  expect(control.completed).toBe(base.clients);
  expect(control.peerBytes).toBe(0);
  expect(control.seedBytes).toBe(control.receivedBytes);
});

it('S6-EMPTY reports incomplete clients when the seed cannot introduce any pieces', () => {
  const result = simulateSwarm({ ...base, seedBytesPerSecond: 0, durationMs: 1000 });
  expect(result.completed).toBe(0);
  expect(result.completionMs).toEqual(Array.from({ length: base.clients }, () => null));
  expect(result.receivedBytes).toBe(0);
  expect(result.simulatedMs).toBe(1000);
});

it('S6-BOUNDS rejects invalid clocks, rates and allocations before simulation', () => {
  for (const change of [
    { clients: 1001 }, { clients: 0 }, { clients: Number.NaN },
    { seed: 0 }, { seed: 2 ** 32 }, { fileBytes: 0 },
    { clients: 1000, fileBytes: 4096 * 64 * KiB },
    { tickMs: 0 }, { latencyMs: -1 }, { durationMs: 250.5 },
    { peerDegree: 9 }, { offlineMs: 10_000 }, { lossRate: 1.1 },
    { peerBytesPerSecond: 1 }, { downloadBytesPerSecond: Infinity },
    { leaveAfterCompleteMs: -1 }, { stopPeerPathsAtMs: -1 },
  ]) expect(() => simulateSwarm({ ...base, ...change })).toThrow(RangeError);
});
