import { chromium } from '@playwright/test';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir, release } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const artifact = resolve('tools/spikes/dist/saved-copy.html');
const contents = await readFile(artifact);
const digest = createHash('sha256').update(contents).digest('hex');
const expected = (await readFile('tools/spikes/dist/saved-copy.sha256', 'utf8')).trim();
if (digest !== expected) throw new Error('Artifact digest mismatch');

async function observe(page, path, label) {
  await page.goto(pathToFileURL(path).href);
  await page.getByRole('button', { name: 'Run checks' }).click();
  await page.getByRole('status').filter({ hasText: /^Complete$/ }).waitFor();
  return { case: label, report: JSON.parse(await page.getByLabel('Report').inputValue()) };
}

const observations = [];
for (const channel of ['chromium', 'chrome']) {
  const directory = await mkdtemp(join(tmpdir(), 'openmesh-s4-'));
  const profile = join(directory, 'profile');
  const copy = join(directory, 'copy.html');
  const moved = join(directory, 'moved/copy.html');
  await mkdir(join(directory, 'moved'));
  await Promise.all([copyFile(artifact, copy), copyFile(artifact, moved)]);
  let context;
  try {
    const options = { headless: true, chromiumSandbox: true, ...(channel === 'chrome' ? { channel: 'chrome' } : {}) };
    context = await chromium.launchPersistentContext(profile, options);
    const browser = context.browser();
    if (!browser) throw new Error('Missing browser handle');
    const version = browser.version();
    await context.setOffline(true);
    const requests = [];
    await context.route(/^https?:/, (route) => { requests.push(route.request().url()); return route.abort(); });
    const page = await context.newPage();
    const cases = [];
    cases.push(await observe(page, artifact, 'original'));
    cases.push(await observe(page, artifact, 'reload'));
    cases.push(await observe(page, copy, 'renamed-copy'));
    cases.push(await observe(page, moved, 'different-directory-copy'));
    cases.push(await observe(page, artifact, 'original-after-copies'));
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    await context.setOffline(true);
    await context.route(/^https?:/, (route) => { requests.push(route.request().url()); return route.abort(); });
    cases.push(await observe(await context.newPage(), artifact, 'browser-restart'));
    const beforeRestart = cases[4].report.storage;
    const afterRestart = cases[5].report.storage;
    const first = cases[0].report.storage;
    const reloaded = cases[1].report.storage;
    observations.push({ channel, version, headless: true, chromium_sandbox_requested: true,
      offline: true, cases,
      same_file_reload_retained: typeof first.written_token === 'string' && reloaded.previous_token === first.written_token,
      browser_restart_retained: typeof beforeRestart.written_token === 'string'
        && afterRestart.previous_token === beforeRestart.written_token,
      http_requests: requests.length });
  } finally {
    await context?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
const report = { test: 'S-4', measured_at: new Date().toISOString(), node: process.version,
  platform: process.platform, arch: process.arch, kernel: release(),
  source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  artifact_bytes: contents.length, artifact_sha256: digest, observations };
await writeFile('docs/spikes/S-4-mac-observations.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ artifact_bytes: report.artifact_bytes, artifact_sha256: digest,
  observations: observations.map(({ cases, ...rest }) => ({ ...rest,
    cases: cases.map(({ case: label, report }) => ({ case: label, secure_context: report.secure_context,
      crypto_supported: report.crypto.filter((row) => row.supported).length,
      storage_ok: report.storage.ok, previous_token: report.storage.previous_token,
      written_token: report.storage.written_token, source_fetch: report.source_fetch })) })) }, null, 2));
