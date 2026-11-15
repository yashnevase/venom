import { mkdir, readdir, readFile, writeFile, copyFile, cp } from 'node:fs/promises';
const output = new URL('./spikes/dist/browser-engine/', import.meta.url);
await mkdir(output, { recursive: true });
for (const module of ['core', 'engine']) {
  const source = new URL(`../packages/${module}/dist/`, import.meta.url);
  const destination = new URL(`${module}/`, output);
  await mkdir(destination, { recursive: true });
  for (const name of await readdir(source)) {
    if (!name.endsWith('.js')) continue;
    const text = (await readFile(new URL(name, source), 'utf8'))
      .replaceAll("'@openmesh/core'", "'../core/index.js'")
      .replaceAll("'cborg/length'", "'../cborg/lib/length.js'")
      .replaceAll("'cborg'", "'../cborg/cborg.js'")
      .replaceAll("'pako'", "'../../compression/pako.mjs'");
    await writeFile(new URL(name, destination), text);
  }
}
await cp(new URL('../packages/core/dist/data/', import.meta.url), new URL('core/data/', output), { recursive: true });
const cborg = new URL('../packages/core/node_modules/cborg/', import.meta.url);
await mkdir(new URL('cborg/', output), { recursive: true });
await copyFile(new URL('cborg.js', cborg), new URL('cborg/cborg.js', output));
await copyFile(new URL('LICENSE', cborg), new URL('cborg/LICENSE', output));
await cp(new URL('lib/', cborg), new URL('cborg/lib/', output), { recursive: true });
await copyFile(new URL('../LICENSE', import.meta.url), new URL('LICENSE', output));
await writeFile(new URL('REVIEW_STATUS.txt', output), 'Experimental, not independently reviewed\n');
