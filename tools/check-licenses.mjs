import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Inspect every installed package, including transitive build-time dependencies.
const store = new URL('../node_modules/.pnpm/', import.meta.url);
const allowed = new Set([
  'MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD',
  'CC0-1.0', 'CC-BY-4.0', 'Python-2.0', 'BlueOak-1.0.0',
  '(MIT OR CC0-1.0)', '(MIT AND Zlib)', '(MIT OR Apache-2.0)', 'MPL-2.0',
]);
const inspected = new Set();
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    const packageDirectory = new URL(`${entry.name}/`, directory);
    if (entry.name.startsWith('@')) {
      await inspect(packageDirectory);
      continue;
    }
    const manifest = JSON.parse(await readFile(new URL('package.json', packageDirectory), 'utf8'));
    const id = `${manifest.name}@${manifest.version}`;
    if (inspected.has(id)) continue;
    if (!allowed.has(manifest.license)) {
      throw new Error(`Review license for ${id} — ${manifest.license ?? 'missing'}`);
    }
    inspected.add(id);
  }
}
for (const entry of await readdir(store, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'node_modules') continue;
  await inspect(new URL(`${entry.name}/node_modules/`, store));
}
if (inspected.size === 0) throw new Error('No dependency licenses checked');
console.log(`L0-LICENSE — ${inspected.size} installed package licenses checked`);

const recoveryData = new URL('../packages/core/src/data/', import.meta.url);
const wordlist = await readFile(new URL('bip39-english.txt', recoveryData));
const notice = await readFile(new URL('bip39-LICENSE.txt', recoveryData));
if (createHash('sha256').update(wordlist).digest('hex') !== '2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda'
  || createHash('sha256').update(notice).digest('hex') !== 'd5e3c7c62a84e80073201e2f6e5130e9e6804fa05f8ac4f8b26a13c7d3969697') {
  throw new Error('Review pinned BIP-39 wordlist or MIT notice changes');
}
console.log('L0-VENDORED — BIP-39 English data and MIT notice hashes checked');
