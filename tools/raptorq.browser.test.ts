import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('S1-BROWSER runs the worker codec benchmark after initialization with further HTTP blocked', async ({ page, context }) => {
  test.setTimeout(120_000);
  const response = await page.goto('http://127.0.0.1:8321/raptorq.html');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('status')).toHaveText('Ready', { timeout: 15_000 });
  const requests: string[] = [];
  await context.route(/^https?:/, (route) => { requests.push(route.request().url()); return route.abort(); });
  await page.getByLabel('Device notes').fill('Playwright Mac codec fixture');
  await page.getByRole('button', { name: 'Run benchmark' }).click();
  await expect(page.getByRole('status')).toHaveText('Complete', { timeout: 100_000 });
  const result = JSON.parse(await page.getByLabel('Report').inputValue()) as {
    probe: string; outcome: string; device_notes: string;
    cases: { outcome: string; completed_trials: number }[];
  };
  expect(result.probe).toBe('S-1-codec');
  expect(result.outcome).toBe('verified');
  expect(result.device_notes).toBe('Playwright Mac codec fixture');
  expect(result.cases).toHaveLength(18);
  expect(result.cases.every((row) => row.outcome === 'verified' && row.completed_trials === 8)).toBe(true);
  const save = page.getByRole('link', { name: 'Save report' });
  await expect(save).toHaveAttribute('href', /^blob:/);
  await expect(save).toHaveAttribute('download', 'openmesh-s1-raptorq.json');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    save.click(),
  ]);
  expect(download.suggestedFilename()).toBe('openmesh-s1-raptorq.json');
  const path = await download.path();
  if (!path) throw new Error('Missing report download');
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(result);
  await expect(page.getByText('Download requested. Check browser Downloads.')).toBeVisible();
  expect(requests).toEqual([]);
});

test('S1-UNAVAILABLE reports worker initialization failure when its WASM asset is blocked', async ({ page }) => {
  await page.route('**/*raptorq_wasm_bg.wasm', (route) => route.abort());
  const response = await page.goto('http://127.0.0.1:8321/raptorq.html');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('status')).toHaveText('Unavailable', { timeout: 15_000 });
  expect(JSON.parse(await page.getByLabel('Report').inputValue())).toMatchObject({
    probe: 'S-1-codec', outcome: 'initialization-failed',
  });
  await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeDisabled();
});

test('S1-DEADLINE terminates a non-completing worker and records a timeout', async ({ page, context }) => {
  await context.route('**/raptorq-worker.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'postMessage({v:1,type:"ready"}); addEventListener("message", () => {});',
  }));
  await page.clock.install();
  await page.goto('http://127.0.0.1:8321/raptorq.html');
  await expect(page.getByRole('status')).toHaveText('Ready');
  await page.getByRole('button', { name: 'Run benchmark' }).click();
  await page.clock.fastForward(120_001);
  await expect(page.getByRole('status')).toHaveText('Timed out');
  expect(JSON.parse(await page.getByLabel('Report').inputValue())).toMatchObject({
    probe: 'S-1-codec', outcome: 'timed-out', error: 'ExecutionDeadline',
  });
  await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeDisabled();
});
