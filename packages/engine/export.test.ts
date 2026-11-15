import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createVerifiedBundleSource } from './src/export.js';

it('validates Manifest linkage and checks staged chunks while exporting', async () => {
  const data = JSON.parse(await readFile(new URL('../test-vectors/envelopes.json', import.meta.url), 'utf8')) as {
    vectors: { id: string; wire_hex: string; manifest_hex?: string; chunks_hex?: string[] }[];
  };
  const vector = data.vectors.find(item => item.id === 'chunked-65521');
  if (!vector?.manifest_hex || !vector.chunks_hex) throw new Error('Missing fixture');
  const hex = (text: string) => new Uint8Array(Buffer.from(text, 'hex'));
  for (const corrupt of [false, true]) {
    const chunks = vector.chunks_hex.map(hex);
    if (corrupt) { const first = chunks[0]; if (!first) throw new Error('Missing chunk'); first[0] = 255; }
    const source = await createVerifiedBundleSource(hex(vector.wire_hex), hex(vector.manifest_hex), {
      async *open() { for (const chunk of chunks) yield await Promise.resolve(chunk); },
    }, 16384, 200000);
    const consume = async () => { let size = 0; for await (const bytes of source.open()) size += bytes.length; return size; };
    if (corrupt) await expect(consume()).rejects.toThrow();
    else expect(await consume()).toBe(source.size);
  }
  const manifest = hex(vector.manifest_hex); manifest[manifest.length - 1] = 0;
  await expect(createVerifiedBundleSource(hex(vector.wire_hex), manifest,
    { async *open() {} }, 16384, 200000)).rejects.toThrow();
});
