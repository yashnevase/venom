import { readdir, readFile } from 'node:fs/promises';

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
