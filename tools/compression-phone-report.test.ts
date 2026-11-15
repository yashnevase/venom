import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

interface Measurement {
  algorithm: 'deflate' | 'zstd';
  fixture: 'chat-1KiB' | 'repeated-256KiB' | 'random-256KiB';
  operation: 'compress' | 'decompress';
  input_bytes: number;
  compressed_bytes: number;
  iterations: number;
  median_ms: number;
  p95_ms: number;
  samples_ms: number[];
}

test('D2-PHONE preserves and verifies the complete Xiaomi comparison report', async () => {
  const reportPath = new URL('../docs/spikes/phase-1-compression-xiaomi-note-13.json', import.meta.url);
  const reportBytes = await readFile(reportPath);
  const report = JSON.parse(reportBytes.toString('utf8')) as {
    probe: string;
    v: number;
    outcome: string;
    secure_context: boolean;
    device_notes: string;
    started_at: string;
    user_agent: string;
    build: Record<string, string | number>;
    native_formats: Record<string, string>;
    limits: { maxInputBytes: number; maxOutputBytes: number };
    decoder_execution: string;
    measurements: Measurement[];
    zstd: { heap_before_bytes: number; heap_after_bytes: number };
    expansion_rejection: { expanded_bytes: number; max_output_bytes: number; outcome: string };
  };

  expect(createHash('sha256').update(reportBytes).digest('hex'))
    .toBe('0a8bbfdecc029d5a527ad2361e292b4d54026ca4ce8ef3ff3a603249c4386115');
  expect(report).toMatchObject({
    probe: 'D-2-comparison', v: 1, outcome: 'verified', secure_context: false,
    build: {
      core_commit: 'c1c3577d612d963b65be69c63ff9d94ec5f0d621',
      pako_version: '3.0.3', zstd_wasm_version: '0.0.27',
    },
    limits: { maxInputBytes: 1_048_576, maxOutputBytes: 1_048_576 },
    decoder_execution: 'synchronous', expansion_rejection: { outcome: 'limit-exceeded' },
  });
  expect(report.build.diagnostic_module_sha256).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
  expect(report.build.config_module_sha256).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
  expect(report.measurements).toHaveLength(12);
  for (const algorithm of ['deflate', 'zstd'] as const) {
    const measurements = report.measurements.filter((item) => item.algorithm === algorithm);
    expect(measurements).toHaveLength(6);
    for (const measurement of measurements) {
      expect(measurement.iterations).toBe(16);
      expect(measurement.samples_ms).toHaveLength(16);
      const sorted = [...measurement.samples_ms].sort((a, b) => a - b);
      expect(measurement.median_ms).toBeCloseTo(((sorted[7] ?? 0) + (sorted[8] ?? 0)) / 2, 6);
      expect(measurement.p95_ms).toBe(sorted[15]);
    }
  }
  expect(report.zstd.heap_after_bytes).toBe(report.zstd.heap_before_bytes);

  const paths = [
    ['dist/compression-probe.js', report.build.diagnostic_module_sha256],
    ['dist/compression/config.js', report.build.config_module_sha256],
    ['dist/compression/zstd/zstd.wasm', report.build.zstd_wasm_sha256],
  ] as const;
  for (const [path, expected] of paths) {
    const bytes = await readFile(new URL(`./spikes/${path}`, import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected);
  }
});
