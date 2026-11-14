import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const directory = new URL('../packages/test-vectors/', import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
if (files.length === 0) {
  console.log('Phase 0 — 0 protocol vectors present. Phase 1 conformance is pending.');
} else {
  const result = spawnSync('python3', ['tools/verify-vectors.py'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
