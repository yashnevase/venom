import { test, expect } from '@playwright/test';

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
    expansion_rejection: { outcome: string }; build: { core_commit: string; pako_version: string } };
  expect(report.outcome).toBe('verified');
  expect(report.measurements).toHaveLength(6);
  for (const measurement of report.measurements) {
    expect(measurement.iterations).toBe(16);
    expect(measurement.samples_ms).toHaveLength(16);
  }
  expect(report.expansion_rejection.outcome).toBe('limit-exceeded');
  expect(report.build.pako_version).toBe('3.0.3');
  expect(report.build.core_commit).toMatch(/^[0-9a-f]{40}$/);
  expect(requests).toEqual([]);
});

test('D2-UNAVAILABLE records a typed missing-compressor result', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(globalThis, 'CompressionStream', { value: undefined }); });
  await page.goto('http://127.0.0.1:8321/compression.html');
  await page.getByRole('button', { name: 'Run benchmark' }).click();
  await expect(page.getByRole('status')).toHaveText('Failed');
  const json: unknown = JSON.parse(await page.getByLabel('Report').inputValue());
  expect(json).toMatchObject({ outcome: 'failed', error: 'unsupported-compression' });
});
