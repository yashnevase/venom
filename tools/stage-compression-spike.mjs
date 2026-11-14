import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const require = createRequire(new URL('../packages/core/package.json', import.meta.url));
const pakoDirectory = dirname(require.resolve('pako/package.json'));
const destination = new URL('./spikes/dist/compression/', import.meta.url);
await mkdir(destination, { recursive: true });
await Promise.all([
  copyFile(new URL('../packages/core/dist/compression.js', import.meta.url), new URL('compression.js', destination)),
  copyFile(new URL('../packages/core/dist/config.js', import.meta.url), new URL('config.js', destination)),
  copyFile(join(pakoDirectory, 'dist/pako.mjs'), new URL('pako.mjs', destination)),
  copyFile(new URL('../LICENSE', import.meta.url), new URL('LICENSE', destination)),
]);
const mitLicense = await readFile(join(pakoDirectory, 'LICENSE'), 'utf8');
const sourceMap = JSON.parse(await readFile(join(pakoDirectory, 'dist/pako.mjs.map'), 'utf8'));
const zlibNotices = new Set(sourceMap.sourcesContent.map((source) => source.split('\n\n')[0])
  .filter((header) => header.includes('Permission is granted to anyone to use this software')));
if (zlibNotices.size === 0) throw new Error('Pako zlib notices missing');
await writeFile(new URL('pako-LICENSE', destination), mitLicense + '\n' + [...zlibNotices].join('\n\n') + '\n');
const manifest = JSON.parse(await readFile(join(pakoDirectory, 'package.json'), 'utf8'));
const digest = async (name) => createHash('sha256').update(await readFile(new URL(name, destination))).digest('hex');
await writeFile(new URL('build.json', destination), JSON.stringify({
  core_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  core_module_sha256: await digest('compression.js'),
  pako_version: manifest.version,
  pako_module_sha256: await digest('pako.mjs'),
}, null, 2) + '\n');
