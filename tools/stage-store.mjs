import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const destination = new URL('./spikes/dist/store/', import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(new URL('../packages/store/dist/index.js', import.meta.url), new URL('index.js', destination));
const notice = 'Experimental, not independently reviewed\n';
await writeFile(new URL('REVIEW_STATUS.txt', destination), notice);
await writeFile(new URL('../packages/store/dist/REVIEW_STATUS.txt', import.meta.url), notice);
console.log(notice.trim());
