import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';

async function expectSavedReport(page: Page, expected: unknown, filename: string): Promise<void> {
  const save = page.getByRole('link', { name: 'Save report' });
  await expect(save).toHaveAttribute('href', /^blob:/);
  await expect(save).toHaveAttribute('download', filename);
  const [download] = await Promise.all([page.waitForEvent('download'), save.click()]);
  expect(download.suggestedFilename()).toBe(filename);
  const path = await download.path();
  if (!path) throw new Error('Missing report download');
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(expected);
  await expect(page.getByText('Download requested. Check browser Downloads.')).toBeVisible();
}

test('D2-BROWSER runs the staged core benchmark with HTTP blocked after loading', async ({ page }) => {
  const response = await page.goto('http://127.0.0.1:8321/compression.html');
  expect(response?.status()).toBe(200);
  const run = page.getByRole('button', { name: 'Run benchmark' });
  await expect(run).toBeEnabled();
  const requests: string[] = [];
  await page.route('**/*', (route) => { requests.push(route.request().url()); return route.abort(); });
  await run.click();
  await expect(page.getByRole('status')).toHaveText('Complete');
  const json: unknown = JSON.parse(await page.getByLabel('Report').inputValue());
  const report = json as { outcome: string; measurements: { iterations: number; samples_ms: number[] }[];
    expansion_rejection: { outcome: string }; build: { core_commit: string; pako_version: string;
      diagnostic_module_sha256: string; config_module_sha256: string } };
  expect(report.outcome).toBe('verified');
  expect(report.measurements).toHaveLength(6);
  for (const measurement of report.measurements) {
    expect(measurement.iterations).toBe(16);
    expect(measurement.samples_ms).toHaveLength(16);
  }
  expect(report.expansion_rejection.outcome).toBe('limit-exceeded');
  expect(report.build.pako_version).toBe('3.0.3');
  expect(report.build.core_commit).toMatch(/^[0-9a-f]{40}$/);
  const controller = await readFile(new URL('./spikes/dist/compression-probe.js', import.meta.url));
  const config = await readFile(new URL('./spikes/dist/compression/config.js', import.meta.url));
  expect(report.build.diagnostic_module_sha256).toBe(createHash('sha256').update(controller).digest('hex'));
  expect(report.build.config_module_sha256).toBe(createHash('sha256').update(config).digest('hex'));
  await expectSavedReport(page, report, 'openmesh-d2-deflate.json');
  expect(requests).toEqual([]);
});

test('D2-COMPARE measures both codecs without further HTTP and interoperates with native zstd', async ({ page }) => {
  const response = await page.goto('http://127.0.0.1:8321/compression-compare.html');
  expect(response?.status()).toBe(200);
  const run = page.getByRole('button', { name: 'Run benchmark' });
  await expect(run).toBeEnabled({ timeout: 20000 });
  const requests: string[] = [];
  await page.route('**/*', (route) => { requests.push(route.request().url()); return route.abort(); });
  await run.click();
  await expect(page.getByRole('status')).toHaveText('Complete', { timeout: 30000 });
  const json: unknown = JSON.parse(await page.getByLabel('Report').inputValue());
  const result = json as { outcome: string; measurements: { algorithm: string; samples_ms: number[] }[];
    zstd: { heap_before_bytes: number; heap_after_bytes: number } };
  expect(result.outcome).toBe('verified');
  expect(result.measurements).toHaveLength(12);
  expect(result.measurements.filter((entry) => entry.algorithm === 'zstd')).toHaveLength(6);
  expect(result.measurements.every((entry) => entry.samples_ms.length === 16)).toBe(true);
  expect(result.zstd.heap_after_bytes).toBeGreaterThanOrEqual(result.zstd.heap_before_bytes);
  await expectSavedReport(page, result, 'openmesh-d2-comparison.json');
  const plain = Buffer.from('OpenMesh independent zstd fixture');
  const wire = await page.evaluate(async ({ input, compressed }) => {
    const url = 'http://127.0.0.1:8321/dist/compression/zstd/index.web.js';
    const loaded: unknown = await import(url);
    const codec = loaded as { compress(input: Uint8Array, level: number): Uint8Array;
      decompress(input: Uint8Array): Uint8Array };
    const decoded = codec.decompress(new Uint8Array(compressed));
    if (!decoded.every((byte, index) => byte === input[index]) || decoded.length !== input.length) {
      throw new Error('Native-to-WASM mismatch');
    }
    return Array.from(codec.compress(new Uint8Array(input), 3));
  }, { input: Array.from(plain), compressed: Array.from(zstdCompressSync(plain)) });
  expect(zstdDecompressSync(new Uint8Array(wire))).toEqual(plain);
  expect(requests).toEqual([]);
});

test('D2-WASM-UNAVAILABLE records initialization failure', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(globalThis, 'WebAssembly', { value: undefined }); });
  await page.goto('http://127.0.0.1:8321/compression-compare.html');
  await expect(page.getByRole('status')).toHaveText('Failed', { timeout: 20000 });
  expect(await page.getByLabel('Report').inputValue()).toContain('failed');
  const report: unknown = JSON.parse(await page.getByLabel('Report').inputValue());
  await expectSavedReport(page, report, 'openmesh-d2-comparison.json');
});

test('D2-UNAVAILABLE records a typed missing-compressor result', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(globalThis, 'CompressionStream', { value: undefined }); });
  await page.goto('http://127.0.0.1:8321/compression.html');
  await page.getByRole('button', { name: 'Run benchmark' }).click();
  await expect(page.getByRole('status')).toHaveText('Failed');
  const json: unknown = JSON.parse(await page.getByLabel('Report').inputValue());
  expect(json).toMatchObject({ outcome: 'failed', error: 'unsupported-compression' });
  await expectSavedReport(page, json, 'openmesh-d2-deflate.json');
});
