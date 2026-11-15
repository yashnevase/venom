import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8322/raptorq.html');
  await page.getByRole('status').filter({ hasText: /^Ready$/ }).waitFor({ timeout: 20_000 });
  const requests = [];
  await context.route(/^https?:/, (route) => { requests.push(route.request().url()); return route.abort(); });
  await page.getByLabel('Device notes').fill('Mac arm64, headless Chromium, HTTP loopback, dedicated-worker codec only');
  await page.getByRole('button', { name: 'Run benchmark' }).click();
  await page.getByRole('status').filter({ hasText: /^Complete$/ }).waitFor({ timeout: 120_000 });
  const report = JSON.parse(await page.getByLabel('Report').inputValue());
  const observation = { host_node: process.version, host_platform: process.platform,
    host_arch: process.arch, browser_version: browser.version(), headless: true,
    chromium_sandbox_requested: true, http_requests_after_ready: requests.length, ...report };
  await writeFile('docs/spikes/S-1-raptorq-mac.json', JSON.stringify(observation, null, 2) + '\n');
  console.log(JSON.stringify({ outcome: report.outcome, heap_before_bytes: report.heap_before_bytes,
    heap_after_bytes: report.heap_after_bytes, initialization_ms: report.initialization_ms,
    cases: report.cases.map((row) => ({ input_bytes: row.input_bytes, packet_bytes: row.packet_bytes,
      pattern: row.pattern, outcome: row.outcome, encode_median_ms: row.encode.median_ms,
      decode_median_ms: row.decode.median_ms })) }, null, 2));
  if (report.outcome !== 'verified' || requests.length > 0) throw new Error('Diagnostic did not verify');
} finally {
  await browser.close();
}
