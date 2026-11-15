import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const source = dirname(fileURLToPath(import.meta.resolve('@raptorqr/raptorq-wasm')));
const manifest = JSON.parse(await readFile(join(source, '../package.json'), 'utf8'));
if (manifest.name !== '@raptorqr/raptorq-wasm' || manifest.version !== '0.1.1') throw new Error('Unexpected codec artifact');
const destination = new URL('./spikes/dist/raptorq/', import.meta.url);
await mkdir(new URL('./codec/wasm/', destination), { recursive: true });
const assets = [];
async function stage(name, bytes, dependency) {
  await writeFile(new URL(name, destination), bytes);
  assets.push({ name, dependency, bytes: bytes.length, gzip_bytes: gzipSync(bytes).length,
    sha256: createHash('sha256').update(bytes).digest('hex') });
}
for (const name of ['raptorq-benchmark.js', 'raptorq-worker.js', 'raptorq-page.js']) {
  const input = await readFile(new URL(`./spikes/dist/${name}`, import.meta.url), 'utf8');
  const rewritten = input.replaceAll("'@raptorqr/raptorq-wasm'", "'./codec/index.js'");
  await stage(name, Buffer.from(rewritten), false);
}
for (const name of ['index.js', 'wasm/raptorqr_raptorq_wasm.js', 'wasm/raptorqr_raptorq_wasm_bg.wasm']) {
  await stage(`codec/${name}`, await readFile(join(source, name)), true);
}
await writeFile(new URL('MIT-LICENSE.txt', destination), await readFile(join(source, '../LICENSE')));
await writeFile(new URL('UPSTREAM-NOTICES.txt', destination), await readFile(new URL('./spikes/raptorq-NOTICES.txt', import.meta.url)));
const dependencyAssets = assets.filter((asset) => asset.dependency);
const metadata = {
  source_base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  package: '@raptorqr/raptorq-wasm', version: '0.1.1', declared_crate: 'raptorq 2.0.1',
  npm_integrity: 'sha512-u+HRTSDeN/SbFWfSnXKDPdAJXsncJsELuFMG+UyndmXsbZe+5l4cYtsrrzWTOB2k/cowjG9dXztSQ6CIW+XLsA==',
  dependency_raw_bytes: dependencyAssets.reduce((sum, asset) => sum + asset.bytes, 0),
  dependency_gzip_body_bytes: dependencyAssets.reduce((sum, asset) => sum + asset.gzip_bytes, 0),
  assets,
};
await writeFile(new URL('build.json', destination), JSON.stringify(metadata, null, 2) + '\n');
