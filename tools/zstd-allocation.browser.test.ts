import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('D2-ZSTD-ALLOCATION observes a declared-size allocation beyond the fallback option before payload decoding', async ({ page }) => {
  await page.goto('http://127.0.0.1:8321/compression-compare.html');
  await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeEnabled({ timeout: 20_000 });
  const result = await page.evaluate(async () => {
    const url = 'http://127.0.0.1:8321/dist/zstd-allocation-probe.js';
    const loaded: unknown = await import(url);
    const probe = loaded as { measureZstdAllocation(): Promise<{
      requested_allocation_bytes: number[]; blocked_allocation_bytes: number | null;
      retained_source_bytes_before_probe_cleanup: number; restored_roundtrip: boolean;
    }> };
    return probe.measureZstdAllocation();
  });
  expect(result.requested_allocation_bytes).toEqual([12, 33_554_432]);
  expect(result.blocked_allocation_bytes).toBe(33_554_432);
  expect(result.retained_source_bytes_before_probe_cleanup).toBe(12);
  expect(result.restored_roundtrip).toBe(true);
  const record = JSON.parse(await readFile(new URL('../docs/spikes/phase-1-zstd-allocation-review.json', import.meta.url), 'utf8')) as {
    requested_allocation_bytes: number[]; wasm_sha256: string; wrapper_sha256: string; probe_sha256: string;
  };
  expect(record.requested_allocation_bytes).toEqual(result.requested_allocation_bytes);
  for (const [path, expected] of [
    ['compression/zstd/zstd.wasm', record.wasm_sha256],
    ['compression/zstd/simple/decompress.js', record.wrapper_sha256],
    ['zstd-allocation-probe.js', record.probe_sha256],
  ] as const) {
    const bytes = await readFile(new URL(`./spikes/dist/${path}`, import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected);
  }
});
