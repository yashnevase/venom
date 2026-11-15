import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { deriveTag, deriveTagWindow } from './src/tag.js';

const key = Uint8Array.from({ length: 32 }, (_, index) => index);
const maxCounter = (1n << 64n) - 1n;

describe('Phase 1 Tag acceptance', () => {
  it('VEC-TAG matches independently generated JSON vectors', async () => {
    const json: unknown = JSON.parse(await readFile(
      new URL('../test-vectors/tags.json', import.meta.url), 'utf8',
    ));
    expect(json).toHaveProperty('version', 1);
    const data = json as {
      vectors: { key_hex: string; counter: string; tag_hex: string }[];
    };
    expect(data.vectors).toHaveLength(8);
    for (const vector of data.vectors) {
      const result = await deriveTag(Buffer.from(vector.key_hex, 'hex'), BigInt(vector.counter));
      expect(result).toEqual({ ok: true, value: new Uint8Array(Buffer.from(vector.tag_hex, 'hex')) });
    }
  });

  it('T-UNIT-7 tags depend on the key and counter across clock skew', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    try {
      const first = await deriveTag(key, 3n);
      vi.mocked(Date.now).mockReturnValue(86_400_000 * 2);
      expect(await deriveTag(key, 3n)).toEqual(first);
      expect(await deriveTag(key, 4n)).not.toEqual(first);
      expect(await deriveTag(new Uint8Array(32).fill(255), 3n)).not.toEqual(first);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('T-UNIT-8 includes gaps 0..63 and excludes 64', async () => {
    const result = await deriveTagWindow(key, 7n);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toHaveLength(64);
    const first = await deriveTag(key, 7n);
    const last = await deriveTag(key, 70n);
    const outside = await deriveTag(key, 71n);
    if (!first.ok || !last.ok || !outside.ok) throw new Error('Tag derivation failed');
    expect(result.value[0]).toEqual(first.value);
    expect(result.value[63]).toEqual(last.value);
    expect(result.value).not.toContainEqual(outside.value);
  });

  it('T-UNIT-7 agrees with Node HMAC for 256 deterministic inputs', async () => {
    for (let index = 0; index < 256; index += 1) {
      const counter = BigInt(index) * 0x100000001n;
      const bytes = Buffer.alloc(8);
      bytes.writeBigUInt64BE(counter);
      const expected = createHmac('sha256', key).update('om-tag-v1')
        .update(bytes).digest().subarray(0, 16);
      expect(await deriveTag(key, counter)).toEqual({ ok: true, value: new Uint8Array(expected) });
    }
  });

  it('T-TAG-LIMIT rejects invalid input and prevents counter wrap', async () => {
    for (const counter of [-1n, maxCounter + 1n, 1, '1', null, undefined]) {
      expect(await deriveTag(key, counter)).toEqual({ ok: false, error: 'invalid-counter' });
    }
    for (const invalidKey of [null, undefined, '', new Uint8Array(), new Uint8Array(33)]) {
      expect(await deriveTag(invalidKey, 0n)).toEqual({ ok: false, error: 'invalid-key' });
    }
    expect((await deriveTag(key, maxCounter)).ok).toBe(true);
    expect((await deriveTagWindow(key, maxCounter - 63n)).ok).toBe(true);
    expect(await deriveTagWindow(key, maxCounter - 62n))
      .toEqual({ ok: false, error: 'counter-exhausted' });
    expect(await deriveTagWindow(key, -1n)).toEqual({ ok: false, error: 'invalid-counter' });
    expect(await deriveTagWindow(null, 0n)).toEqual({ ok: false, error: 'invalid-key' });
  });

  it('T-TAG-CRYPTO reports missing WebCrypto as a typed result', async () => {
    vi.stubGlobal('crypto', undefined);
    try {
      expect(await deriveTag(key, 0n)).toEqual({ ok: false, error: 'unsupported-crypto' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
