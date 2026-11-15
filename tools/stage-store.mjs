import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const destination = new URL('./spikes/dist/store/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of ['index.js', 'opfs.js']) {
  await copyFile(new URL('../packages/store/dist/' + name, import.meta.url), new URL(name, destination));
}
const notice = 'Experimental, not independently reviewed\n';
await writeFile(new URL('REVIEW_STATUS.txt', destination), notice);
await writeFile(new URL('../packages/store/dist/REVIEW_STATUS.txt', import.meta.url), notice);
console.log(notice.trim());
