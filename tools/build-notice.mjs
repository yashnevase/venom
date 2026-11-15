import { mkdir, writeFile } from 'node:fs/promises';
const EXPERIMENTAL_NOTICE = 'Experimental, not independently reviewed';

console.log(EXPERIMENTAL_NOTICE);
for (const directory of ['../packages/core/dist/', '../packages/engine/dist/', '../packages/carriers/file/dist/', './spikes/dist/']) {
  const output = new URL(directory, import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('REVIEW_STATUS.txt', output), EXPERIMENTAL_NOTICE + '\n');
}
