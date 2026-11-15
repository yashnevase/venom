import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const script = await readFile(new URL('./spikes/dist/saved-copy-probe.js', import.meta.url), 'utf8');
const template = await readFile(new URL('./spikes/saved-copy.template.html', import.meta.url), 'utf8');
const license = await readFile(new URL('../LICENSE', import.meta.url), 'utf8');
if (!template.includes('/*INLINE_PROBE*/') || /<\/script/i.test(script)) throw new Error('Invalid single-file template');
if (license.includes('-->')) throw new Error('Invalid license comment');
const artifact = template.replace('/*INLINE_PROBE*/', script).replace('<!--LICENSE_TEXT-->', `<!--\n${license}\n-->`);
await writeFile(new URL('./spikes/dist/saved-copy.html', import.meta.url), artifact);
await writeFile(new URL('./spikes/dist/saved-copy.sha256', import.meta.url), createHash('sha256').update(artifact).digest('hex') + '\n');
