import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const file = pathToFileURL(resolve('tools/spikes/dist/saved-copy.html')).href;

test('S4-FILE exercises native crypto and scratch storage across offline file reloads', async ({ page, context }) => {
  await context.setOffline(true);
  const requests: string[] = [];
  await page.route(/^https?:/, (route) => { requests.push(route.request().url()); return route.abort(); });
  await page.goto(file);
  const run = page.getByRole('button', { name: 'Run checks' });
  await run.click();
  await expect(page.getByRole('status')).toHaveText('Complete');
  const json: unknown = JSON.parse(await page.getByLabel('Report').inputValue());
  const first = json as { protocol: string; crypto: { supported: boolean }[];
    storage: { ok: boolean; roundtrip: boolean; written_token: string } };
  expect(first.protocol).toBe('file:');
  expect(first.crypto).toHaveLength(6);
  expect(first.crypto.every((row) => row.supported)).toBe(true);
  expect(first.storage.ok && first.storage.roundtrip).toBe(true);
  await page.reload();
  await run.click();
  await expect(page.getByRole('status')).toHaveText('Complete');
  const second: unknown = JSON.parse(await page.getByLabel('Report').inputValue());
  expect(second).toMatchObject({ storage: { previous_token: first.storage.written_token, roundtrip: true } });
  await page.getByRole('button', { name: 'Remove test data' }).click();
  await expect(page.getByRole('status')).toHaveText('Test data removed');
  await run.click();
  await expect(page.getByRole('status')).toHaveText('Complete');
  const third: unknown = JSON.parse(await page.getByLabel('Report').inputValue());
  expect(third).toMatchObject({ storage: { previous_token: null, roundtrip: true } });
  await page.getByRole('button', { name: 'Remove test data' }).click();
  expect(requests).toEqual([]);
});

test('S4-DENIAL records unavailable crypto and storage without aborting the diagnostic', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined });
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined });
  });
  await page.goto(file);
  await page.getByRole('button', { name: 'Run checks' }).click();
  await expect(page.getByRole('status')).toHaveText('Complete');
  const json: unknown = JSON.parse(await page.getByLabel('Report').inputValue());
  const result = json as { crypto: { supported: boolean }[]; storage: { ok: boolean } };
  expect(result.crypto).toHaveLength(6);
  expect(result.crypto.every((row) => !row.supported)).toBe(true);
  expect(result.storage.ok).toBe(false);
});

test('S4-INDEPENDENT keeps the storage observation independent of crypto availability', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(globalThis, 'crypto', { value: undefined }); });
  await page.goto(file);
  await page.getByRole('button', { name: 'Run checks' }).click();
  await expect(page.getByRole('status')).toHaveText('Complete');
  const result: unknown = JSON.parse(await page.getByLabel('Report').inputValue());
  expect(result).toMatchObject({ storage: { ok: true, roundtrip: true } });
  await page.getByRole('button', { name: 'Remove test data' }).click();
});
