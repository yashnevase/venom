import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = new URL('../packages/core/src/data/', import.meta.url);
const output = new URL('../packages/core/dist/data/', import.meta.url);
const provenance = JSON.parse(await readFile(new URL('bip39-provenance.json', source), 'utf8'));
const raw = await readFile(new URL('bip39-english.txt', source), 'utf8');
const wrapper = '// Generated from bip39-english.txt. MIT license in bip39-LICENSE.txt.\n'
  + 'export const RECOVERY_WORDS: readonly string[] = Object.freeze(`' + raw + "`.trimEnd().split('\\n'));\n";
if (await readFile(new URL('bip39-english.ts', source), 'utf8') !== wrapper) {
  throw new Error('BIP-39 data wrapper differs from its pinned wordlist');
}
for (const [file, record] of [['bip39-english.txt', provenance.files['english.txt']],
  ['bip39-LICENSE.txt', provenance.files.LICENSE]]) {
  const bytes = await readFile(new URL(file, source));
  if (createHash('sha256').update(bytes).digest('hex') !== record.sha256) {
    throw new Error('Pinned BIP-39 data or license hash mismatch');
  }
}
await mkdir(output, { recursive: true });
for (const name of ['bip39-english.txt', 'bip39-LICENSE.txt', 'bip39-provenance.json']) {
  await copyFile(new URL(name, source), new URL(name, output));
}
