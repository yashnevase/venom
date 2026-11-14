import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('P0-ACCEPTANCE workspace, strict checks, and CI are configured', async () => {
  const manifest = JSON.parse(await read('package.json'));
  assert.equal(manifest.private, true);
  assert.match(manifest.packageManager, /^pnpm@\d+\.\d+\.\d+$/);
  for (const script of ['check', 'typecheck', 'lint', 'test', 'test:vectors']) {
    assert.equal(typeof manifest.scripts[script], 'string');
  }
  const tsconfig = JSON.parse(await read('tsconfig.json'));
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noUncheckedIndexedAccess, true);
  assert.match(await read('pnpm-workspace.yaml'), /packages\/\*/);
  const workflow = await read('.github/workflows/ci.yml');
  assert.match(workflow, /--frozen-lockfile/);
  assert.match(workflow, /pnpm check/);
  assert.match(workflow, /pnpm audit/);
  for (const path of ['AGENTS.md', 'docs/03_ARCHITECTURE.md',
    'docs/04_PROTOCOL_DRAFT.md', 'docs/11_DATA_MODEL_AND_ALGORITHMS.md',
    'docs/openmesh_master_research.md', 'docs/adr/000-template.md',
    'eslint.config.mjs', 'LICENSE', 'docs/LICENSE']) {
    assert.ok((await read(path)).length > 0, path);
  }
});
