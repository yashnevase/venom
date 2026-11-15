import { beforeAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { initSync } from '@raptorqr/raptorq-wasm';
import { runRaptorqCase } from './spikes/raptorq-benchmark.js';

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasm = await readFile(require.resolve('@raptorqr/raptorq-wasm/wasm/raptorqr_raptorq_wasm_bg.wasm'));
  initSync({ module: new Uint8Array(wasm) });
});

it('S1-CODEC reconstructs fixed fixtures in order, with late starts and drops, and with duplicates', () => {
  for (const packetBytes of [512, 1024, 1280]) {
    for (const pattern of ['ordered', 'late-drop', 'duplicates'] as const) {
      const result = runRaptorqCase({ inputBytes: 200 * 1024, packetBytes, pattern, iterations: 2 });
      expect(result.outcome).toBe('verified');
      expect(result.completed_trials).toBe(2);
      expect(result.trials.every((trial) => trial.matched && trial.max_packet_bytes <= packetBytes)).toBe(true);
      if (pattern === 'late-drop') expect(result.trials.every((trial) => trial.skipped_packets > 0)).toBe(true);
      if (pattern === 'duplicates') expect(result.trials.every((trial) => trial.duplicate_packets > 0)).toBe(true);
    }
  }
});

it('S1-INCOMPLETE records an insufficient packet subset without claiming a decode', () => {
  const result = runRaptorqCase({ inputBytes: 200 * 1024, packetBytes: 1024, pattern: 'insufficient', iterations: 2 });
  expect(result.outcome).toBe('incomplete');
  expect(result.completed_trials).toBe(0);
  expect(result.trials.every((trial) => !trial.matched && trial.decoded_bytes === null)).toBe(true);
});

it('S1-EDGES preserves exact lengths for small, partial-symbol and maximum fixtures', () => {
  for (const inputBytes of [1, 123, 124, 125, 127, 128, 129, 1_048_576]) {
    const result = runRaptorqCase({ inputBytes, packetBytes: 128, pattern: 'ordered', iterations: 1 });
    expect(result.outcome).toBe('verified');
    expect(result.trials[0]?.decoded_bytes).toBe(inputBytes);
  }
});

it('S1-BOUNDS rejects diagnostic inputs outside the fixed fixture and execution budget', () => {
  for (const change of [{ inputBytes: 0 }, { inputBytes: 2 ** 20 + 1 },
    { packetBytes: 1 }, { packetBytes: 16_385 }, { iterations: 0 },
    { iterations: 17 }, { iterations: Number.NaN }]) {
    expect(() => runRaptorqCase({ inputBytes: 200 * 1024, packetBytes: 1024,
      pattern: 'ordered', iterations: 2, ...change })).toThrow(RangeError);
  }
});

it('S1-REPORT matches the staged assets and recomputes all saved trial summaries', async () => {
  const report = JSON.parse(await readFile(new URL('../docs/spikes/S-1-raptorq-mac.json', import.meta.url), 'utf8')) as {
    outcome: string; http_requests_after_ready: number;
    build: { assets: { name: string; sha256: string }[] };
    cases: ReturnType<typeof runRaptorqCase>[];
  };
  expect(report.outcome).toBe('verified');
  expect(report.http_requests_after_ready).toBe(0);
  expect(report.cases).toHaveLength(18);
  expect(report.build.assets.map((asset) => asset.name)).toEqual([
    'raptorq-benchmark.js', 'raptorq-worker.js', 'raptorq-page.js', 'codec/index.js',
    'codec/wasm/raptorqr_raptorq_wasm.js', 'codec/wasm/raptorqr_raptorq_wasm_bg.wasm',
  ]);
  for (const asset of report.build.assets) {
    const bytes = await readFile(new URL(`./spikes/dist/raptorq/${asset.name}`, import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
  }
  for (const row of report.cases) {
    expect(row.outcome).toBe('verified');
    expect(row.trials).toHaveLength(8);
    expect(row.trials.every((trial) => trial.matched && trial.decoded_bytes === row.input_bytes)).toBe(true);
    for (const operation of ['encode', 'decode'] as const) {
      const values = row.trials.map((trial) => trial[`${operation}_ms`]);
      expect(row[operation].samples_ms).toEqual(values);
      const sorted = [...values].sort((a, b) => a - b);
      expect(row[operation].median_ms).toBe(((sorted[3] ?? 0) + (sorted[4] ?? 0)) / 2);
      expect(row[operation].p95_ms).toBe(sorted[7]);
    }
  }
});
