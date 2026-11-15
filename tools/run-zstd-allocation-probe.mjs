import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8322/compression-compare.html');
  await page.getByRole('status').filter({ hasText: /^Ready$/ }).waitFor({ timeout: 20_000 });
  const observation = await page.evaluate(async () => {
    const probe = await import('http://127.0.0.1:8322/dist/zstd-allocation-probe.js');
    return probe.measureZstdAllocation();
  });
  const hash = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');
  const report = { measured_at: new Date().toISOString(),
    source_base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    node: process.version, platform: process.platform, arch: process.arch,
    browser: browser.version(), headless: true, chromium_sandbox_requested: true,
    package: '@bokuweb/zstd-wasm', version: '0.0.27',
    wasm_sha256: await hash('tools/spikes/dist/compression/zstd/zstd.wasm'),
    wrapper_sha256: await hash('tools/spikes/dist/compression/zstd/simple/decompress.js'),
    probe_sha256: await hash('tools/spikes/dist/zstd-allocation-probe.js'), ...observation };
  if (report.blocked_allocation_bytes !== 33_554_432 || !report.restored_roundtrip) throw new Error('Unexpected probe result');
  await writeFile('docs/spikes/phase-1-zstd-allocation-review.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
