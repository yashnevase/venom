import { expect, it } from 'vitest';
import { encodeBundle, decodeBundle } from './src/bundle.js';
import { sourceFromBlob } from '../carriers/file/src/index.js';

const limits = { maxBytes: 1024, maxReadBytes: 64, maxRecordBytes: 512, maxChunks: 4 };
async function collect(source: AsyncIterable<Uint8Array>) {
  const parts: Uint8Array[] = [];
  for await (const part of source) parts.push(part);
  return new Uint8Array(Buffer.concat(parts));
}
it('packs definite canonical CBOR records and reads through single-byte boundaries', async () => {
  const bytes = await collect(encodeBundle(new Uint8Array([1, 2]), null, [], 1));
  expect([...bytes]).toEqual([1, 0x83, 0x42, 1, 2, 0xf6, 0x80]);
  const records: Uint8Array[] = [];
  await decodeBundle(sourceFromBlob(new Blob([bytes]), 1), limits, record => { records.push(record); return Promise.resolve(); });
  expect(records).toEqual([new Uint8Array([1, 2])]);
});
it('rejects truncation, trailing bytes, future versions and nonminimal lengths', async () => {
  const valid = await collect(encodeBundle(new Uint8Array([1]), null, [], 64));
  for (let size = 0; size < valid.length; size++) {
    await expect(decodeBundle(sourceFromBlob(new Blob([valid.slice(0, size)]), 64), limits, () => Promise.resolve())).rejects.toThrow();
  }
  for (const bytes of [new Uint8Array([...valid, 0]), new Uint8Array([2]), new Uint8Array([1, 0x83, 0x58, 1, 1, 0xf6, 0x80])]) {
    await expect(decodeBundle(sourceFromBlob(new Blob([bytes]), 64), limits, () => Promise.resolve())).rejects.toThrow();
  }
});
it('streams bounded manifest and chunk records in order and rejects quotas before opening', async () => {
  const bytes = await collect(encodeBundle(new Uint8Array([1]), new Uint8Array([1, 3]), [new Uint8Array([4]), new Uint8Array([5])], 2));
  const records: Uint8Array[] = [];
  await decodeBundle(sourceFromBlob(new Blob([bytes]), 2), limits, record => { records.push(record); return Promise.resolve(); });
  expect(records.map(record => [...record])).toEqual([[1], [1, 3], [4], [5]]);
  let opened = false;
  await expect(decodeBundle({ size: 1025, async *open() { opened = true; yield await Promise.resolve(bytes); } }, limits, () => Promise.resolve())).rejects.toThrow();
  expect(opened).toBe(false);
});

it('reads async chunks on demand, bounds output and checks the declared chunk sizes', async () => {
  let pulled = 0;
  let closed = false;
  const chunks = { sizes: [3, 2], async *open() {
    try {
      pulled++; yield await Promise.resolve(new Uint8Array([4, 5, 6]));
      pulled++; yield await Promise.resolve(new Uint8Array([7, 8]));
    } finally { closed = true; }
  } };
  const encoder = encodeBundle(new Uint8Array([1]), new Uint8Array([1]), chunks, 2);
  expect(pulled).toBe(0);
  const bytes = await collect(encoder);
  expect(pulled).toBe(2);
  expect(closed).toBe(true);
  const records: Uint8Array[] = [];
  await decodeBundle(sourceFromBlob(new Blob([bytes]), 2), limits, record => { records.push(record); return Promise.resolve(); });
  expect(records.map(record => [...record])).toEqual([[1], [1], [4, 5, 6], [7, 8]]);
  await expect(collect(encodeBundle(new Uint8Array([1]), new Uint8Array([1]), { ...chunks, sizes: [4, 2] }, 2))).rejects.toThrow();
});

it('declares exact bundle size and returns fresh carrier-compatible reads', async () => {
  const { createBundleSource } = await import('./src/bundle.js');
  const control = new Uint8Array([1, 2]);
  const source = createBundleSource(control, null, { sizes: [], async *open() {} }, 1, 100);
  control.fill(9);
  const first = await collect(source.open());
  expect(source.size).toBe(first.length);
  expect([...first]).toEqual([1, 0x83, 0x42, 1, 2, 0xf6, 0x80]);
  expect(await collect(source.open())).toEqual(first);
  expect(() => createBundleSource(control, null, { sizes: [], async *open() {} }, 1, 2)).toThrow();
});

it('streams 5 MiB with bounded reads and closes a cancelled source', async () => {
  const { createBundleSource } = await import('./src/bundle.js');
  const sizes = Array.from({ length: 80 }, () => 65536);
  let pulled = 0; let closed = 0;
  const chunks = { sizes, async *open() {
    try {
      for (let index = 0; index < sizes.length; index++) {
        pulled++; yield await Promise.resolve(new Uint8Array(65536).fill(index));
      }
    } finally { closed++; }
  } };
  const source = createBundleSource(new Uint8Array([1]), new Uint8Array([1]), chunks, 16384, 6000000);
  let total = 0; let peak = 0;
  for await (const bytes of source.open()) { total += bytes.length; peak = Math.max(peak, bytes.length); }
  expect(total).toBe(source.size);
  expect(peak).toBeLessThanOrEqual(16384);
  expect(pulled).toBe(80);
  for await (const bytes of source.open()) { if (bytes.length === 16384) break; }
  expect(pulled).toBe(81);
  expect(closed).toBe(2);
});

it('closes input when staging fails and rejects huge heads before reading payload', async () => {
  let closed = false; let calls = 0;
  const encoded = await collect(encodeBundle(new Uint8Array([1]), null, [], 64));
  const source = { size: encoded.length, async *open() {
    try { yield await Promise.resolve(encoded); } finally { closed = true; }
  } };
  await expect(decodeBundle(source, limits, () => Promise.reject(new Error('stage failed')))).rejects.toThrow('stage failed');
  expect(closed).toBe(true);
  const header = new Uint8Array([1, 0x83, 0x5a, 0xff, 0xff, 0xff, 0xff]);
  const malformed = { size: 500, async *open() {
    calls++; yield await Promise.resolve(header);
    calls++; yield await Promise.resolve(new Uint8Array(100));
  } };
  await expect(decodeBundle(malformed, limits, () => Promise.resolve())).rejects.toThrow();
  expect(calls).toBe(1);
});
