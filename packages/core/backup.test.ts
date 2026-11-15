import { expect, it, vi } from 'vitest';
import { sealBackup, openBackup } from './src/backup.js';
const limits = { maxBytes: 65536, maxDepth: 12, maxItems: 4096 };
it('restores exact snapshot bytes only with the original recovery entropy', async () => {
  const entropy = new Uint8Array(32).fill(7);
  const snapshot = new Uint8Array([1, 2, 3]);
  const sealed = await sealBackup(snapshot, entropy, 1794700800, limits);
  expect(sealed.ok).toBe(true);
  if (!sealed.ok) throw new Error(sealed.error);
  const opened = await openBackup(sealed.value, entropy, limits);
  expect(opened).toEqual({ ok: true, value: snapshot });
  expect((await openBackup(sealed.value, new Uint8Array(32).fill(8), limits)).ok).toBe(false);
  const changed = sealed.value.slice();
  changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1;
  expect((await openBackup(changed, entropy, limits)).ok).toBe(false);
  expect((await openBackup(sealed.value.slice(1), entropy, limits)).ok).toBe(false);
});

it('honors caller depth/item budgets instead of silently using the default codec limits', async () => {
  const entropy = new Uint8Array(32).fill(7);
  const sealed = await sealBackup(new Uint8Array([1]), entropy, 1794700800, limits);
  if (!sealed.ok) throw new Error(sealed.error);
  expect((await openBackup(sealed.value, entropy, { ...limits, maxDepth: 1 })).ok).toBe(false);
  expect((await sealBackup(new Uint8Array([1]), entropy, 1794700800, { ...limits, maxDepth: 1 })).ok).toBe(false);
  expect((await openBackup(sealed.value, entropy, { ...limits, maxItems: 2 })).ok).toBe(false);
});

it('opens independent Python backups and rejects independently signed-body changes', async () => {
  const { readFile } = await import('node:fs/promises');
  const data = JSON.parse(await readFile(new URL('../test-vectors/backups.json', import.meta.url), 'utf8')) as {
    vectors: { entropy_hex: string; snapshot_hex: string; wire_hex: string; invalid_signature_hex: string }[];
  };
  const hex = (text: string) => new Uint8Array(Buffer.from(text, 'hex'));
  for (const vector of data.vectors) {
    expect(await openBackup(hex(vector.wire_hex), hex(vector.entropy_hex), limits))
      .toEqual({ ok: true, value: hex(vector.snapshot_hex) });
    expect(await openBackup(hex(vector.invalid_signature_hex), hex(vector.entropy_hex), limits))
      .toEqual({ ok: false, error: 'invalid-signature' });
  }
});

it('rejects every bit change and truncation of a complete backup fixture', async () => {
  const entropy = new Uint8Array(32).fill(7);
  const result = await sealBackup(new Uint8Array([1]), entropy, 1794700800, limits);
  if (!result.ok) throw new Error(result.error);
  for (let bit = 0; bit < result.value.length * 8; bit++) {
    const changed = result.value.slice();
    changed[bit >> 3] = (changed[bit >> 3] ?? 0) ^ (1 << (bit & 7));
    expect((await openBackup(changed, entropy, limits)).ok).toBe(false);
  }
  for (let length = 0; length < result.value.length; length++) {
    expect((await openBackup(result.value.subarray(0, length), entropy, limits)).ok).toBe(false);
  }
}, 30000);

it('snapshots inputs and generates fresh exports', async () => {
  const snapshot = new Uint8Array([7]);
  const entropy = new Uint8Array(32).fill(7);
  const pending = sealBackup(snapshot, entropy, 1794700800, limits);
  snapshot.fill(9); entropy.fill(9);
  const sealed = await pending;
  if (!sealed.ok) throw new Error(sealed.error);
  const originalEntropy = new Uint8Array(32).fill(7);
  expect(await openBackup(sealed.value, originalEntropy, limits)).toEqual({ ok: true, value: new Uint8Array([7]) });
  const second = await sealBackup(new Uint8Array([7]), originalEntropy, 1794700800, limits);
  if (!second.ok) throw new Error(second.error);
  expect(second.value).not.toEqual(sealed.value);
});

it('rejects malformed limits and unavailable native operations', async () => {
  for (const maxBytes of [Infinity, NaN, 4.5, -1]) {
    expect(await sealBackup(new Uint8Array([1]), new Uint8Array(32), 0, { ...limits, maxBytes }))
      .toEqual({ ok: false, error: 'invalid-limits' });
    expect(await openBackup(new Uint8Array([1]), new Uint8Array(32), { ...limits, maxBytes }))
      .toEqual({ ok: false, error: 'invalid-limits' });
  }
  const random = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(() => { throw new Error('unavailable'); });
  try { expect((await sealBackup(new Uint8Array([1]), new Uint8Array(32), 0, limits)).ok).toBe(false); }
  finally { random.mockRestore(); }
});
