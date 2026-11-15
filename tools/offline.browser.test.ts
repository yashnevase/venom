import { expect, test } from '@playwright/test';

test('S2-LOCAL transfers 4096 bytes with HTTP blocked, then closes both peers', async ({ browser }) => {
  const sender = await browser.newContext();
  const receiver = await browser.newContext();
  try {
    const first = await sender.newPage();
    const second = await receiver.newPage();
    await first.goto('http://127.0.0.1:8321');
    await second.goto('http://127.0.0.1:8321');
    await expect(first).toHaveTitle('S-2 offline connection probe');
    await sender.route('**/*', (route) => route.abort());
    await receiver.route('**/*', (route) => route.abort());

    await first.getByRole('button', { name: 'Create offer', exact: true }).click();
    await expect(first.getByLabel('Local handshake')).not.toHaveValue('');
    await second.getByLabel('Remote handshake').fill(await first.getByLabel('Local handshake').inputValue());
    await second.getByRole('button', { name: 'Create answer', exact: true }).click();
    await expect(second.getByLabel('Local handshake')).not.toHaveValue('');
    await first.getByLabel('Remote handshake').fill(await second.getByLabel('Local handshake').inputValue());
    await first.getByRole('button', { name: 'Apply answer', exact: true }).click();
    try {
      await expect(first.getByRole('status')).toHaveText('Verified 4096 diagnostic bytes', { timeout: 30_000 });
    } finally {
      console.log('S2 sender report', await first.locator('#report').textContent());
    }
    await expect(second.getByRole('status')).toHaveText('Verified 4096 diagnostic bytes');

    await first.getByRole('button', { name: 'Close connection', exact: true }).click();
    await expect(first.getByRole('status')).toHaveText('Closed');
    await expect(second.getByRole('status')).toHaveText('Closed', { timeout: 10_000 });
  } finally {
    await sender.close();
    await receiver.close();
  }
});

test('S2-INPUT rejects malformed, wrong-version and oversized diagnostic handshakes', async ({ page }) => {
  await page.goto('http://127.0.0.1:8321');
  await expect(page).toHaveTitle('S-2 offline connection probe');
  for (const input of ['{', '{"v":2,"type":"offer","sdp":"x"}', 'x'.repeat(65537)]) {
    await page.getByLabel('Remote handshake').fill(input);
    await page.getByRole('button', { name: 'Create answer', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Invalid handshake');
  }
});

test('S2-MANUAL keeps an offer alive while the operator exchanges handshake text', async ({ page }) => {
  await page.goto('http://127.0.0.1:8321');
  await page.clock.install();
  await page.getByRole('button', { name: 'Create offer', exact: true }).click();
  await expect(page.getByLabel('Local handshake')).not.toHaveValue('');
  await page.clock.fastForward(120_001);
  await expect(page.getByRole('status')).toHaveText('Waiting for a path');
  await page.getByRole('button', { name: 'Close connection', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Closed');
});
