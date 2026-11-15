import { expect, it } from 'vitest';
import { createBlobWriter } from './src/blob-writer.js';

it('publishes exactly one completed Blob and snapshots input bytes', async () => {
  const blobs: Blob[] = [];
  const writer = createBlobWriter(3, 10, blob => { blobs.push(blob); return Promise.resolve(); });
  const input = new Uint8Array([1, 2, 3]);
  await writer.write(input);
  input.fill(9);
  expect(blobs).toHaveLength(0);
  await writer.commit();
  expect(blobs).toHaveLength(1);
  const blob = blobs[0];
  if (!blob) throw new Error('Missing artifact');
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  await expect(writer.commit()).rejects.toThrow();
});
it('rejects incomplete and oversized writes and discards aborted staging', async () => {
  let published = false;
  const writer = createBlobWriter(3, 10, () => { published = true; return Promise.resolve(); });
  await writer.write(new Uint8Array(2));
  await expect(writer.commit()).rejects.toThrow();
  await writer.abort();
  await expect(writer.write(new Uint8Array(1))).rejects.toThrow();
  expect(published).toBe(false);
  expect(() => createBlobWriter(11, 10, () => Promise.resolve())).toThrow();
});
it('prevents concurrent commits and contains publisher failure', async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const writer = createBlobWriter(0, 10, async () => { await gate; throw new Error('cancelled'); });
  const commit = writer.commit();
  await expect(writer.commit()).rejects.toThrow();
  await expect(writer.write(new Uint8Array(1))).rejects.toThrow();
  release();
  await expect(commit).rejects.toThrow('cancelled');
  await writer.abort();
});
