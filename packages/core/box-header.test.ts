import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { encodeCbor } from './src/cbor.js';
import type { CborValue } from './src/cbor.js';
import { decodeBoxHeader, encodeBoxHeader } from './src/box-header.js';

const limits = { maxBytes: 16384, maxDepth: 4, maxItems: 32 };
const header = {
  v: 1,
  box_id: new Uint8Array(16).fill(1),
  profile: 'small' as const,
  tag: new Uint8Array(16).fill(2),
  size: 1024n,
  created_coarse: 20000n,
};

function debugValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(debugValue);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (typeof record.$bytes === 'string' && Object.keys(record).length === 1) {
    return new Uint8Array(Buffer.from(record.$bytes, 'hex'));
  }
  if (Array.isArray(record.$map) && Object.keys(record).length === 1) {
    return new Map(record.$map.map((entry) => {
      if (!Array.isArray(entry) || entry.length !== 2) throw new Error('Invalid debug map');
      return [debugValue(entry[0]), debugValue(entry[1])] as const;
    }));
  }
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, debugValue(item)]));
}

describe('Box header codec', () => {
  it('encodes and decodes the documented small profile with owned byte fields', () => {
    const input = { ...header, box_id: new Uint8Array(16).fill(1), tag: new Uint8Array(16).fill(2) };
    const encoded = encodeBoxHeader(input, limits);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = decodeBoxHeader(encoded.value, limits);
    expect(decoded).toMatchObject({ ok: true, value: { v: 1, profile: 'small', size: 1024n, created_coarse: 20000n } });
    if (!decoded.ok) return;
    expect(decoded.value.box_id).not.toBe(input.box_id);
    expect(decoded.value.tag).not.toBe(input.tag);
    encoded.value.fill(0);
    input.box_id.fill(0);
    expect(decoded.value.box_id).toEqual(new Uint8Array(16).fill(1));
  });

  it('encodes chunked and fountain profile fields without changing their meanings', () => {
    for (const profile of ['chunked', 'fountain'] as const) {
      const value = { ...header, profile, chunk_size: 65536n, manifest_hash: new Uint8Array(32).fill(3) };
      const encoded = encodeBoxHeader(value, limits);
      expect(encoded.ok).toBe(true);
      if (!encoded.ok) continue;
      const decoded = decodeBoxHeader(encoded.value, limits);
      expect(decoded).toMatchObject({ ok: true, value: { profile, chunk_size: 65536n,
        manifest_hash: new Uint8Array(32).fill(3) } });
    }
  });

  it('accepts only the published chunk-size values', () => {
    for (const chunkSize of [65536n, 262144n, 1048576n]) {
      expect(encodeBoxHeader({ ...header, chunk_size: chunkSize }, limits).ok).toBe(true);
    }
    expect(encodeBoxHeader({ ...header, chunk_size: 1234n }, limits))
      .toEqual({ ok: false, error: 'invalid-header' });
  });

  it('matches the independent deterministic header vectors for all profiles', async () => {
    const document = JSON.parse(await readFile(new URL('../test-vectors/box-headers.json', import.meta.url), 'utf8')) as {
      vectors: { id: string; value: unknown; cbor_hex: string }[];
    };
    expect(document.vectors).toHaveLength(3);
    for (const vector of document.vectors) {
      const entries = debugValue(vector.value);
      expect(entries).toBeInstanceOf(Map);
      if (!(entries instanceof Map)) continue;
      const input: Record<string, unknown> = {};
      for (const [key, value] of entries) {
        if (typeof key !== 'string') throw new Error('Non-text Box header key');
        input[key] = value;
      }
      const encoded = encodeBoxHeader(input, limits);
      expect(encoded.ok, vector.id).toBe(true);
      if (!encoded.ok) continue;
      expect(Buffer.from(encoded.value).toString('hex'), vector.id).toBe(vector.cbor_hex);
      expect(decodeBoxHeader(encoded.value, limits).ok, vector.id).toBe(true);
    }
  });

  it('returns unsupported-version for a well-formed future header version', () => {
    const encoded = encodeCbor(new Map<string, CborValue>([
      ['v', 2], ['box_id', new Uint8Array(16)], ['profile', 'small'],
      ['tag', new Uint8Array(16)], ['size', 0], ['created_coarse', 0],
    ]), limits);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(decodeBoxHeader(encoded.value, limits)).toEqual({ ok: false, error: 'unsupported-version' });
  });

  it('rejects missing, malformed, mistyped, and unknown schema fields', () => {
    const cases = [
      new Map<string, CborValue>([['v', 1]]),
      new Map<string, CborValue>([['v', 1], ['box_id', new Uint8Array(15)], ['profile', 'small'],
        ['tag', new Uint8Array(16)], ['size', 0], ['created_coarse', 0]]),
      new Map<string, CborValue>([['v', 1], ['box_id', new Uint8Array(16)], ['profile', 'other'],
        ['tag', new Uint8Array(16)], ['size', 0], ['created_coarse', 0]]),
      new Map<string, CborValue>([['v', 1], ['box_id', new Uint8Array(16)], ['profile', 'small'],
        ['tag', new Uint8Array(16)], ['size', -1], ['created_coarse', 0]]),
      new Map<string, CborValue>([['v', 1], ['box_id', new Uint8Array(16)], ['profile', 'small'],
        ['tag', new Uint8Array(16)], ['size', 0], ['created_coarse', 0], ['unexpected', true]]),
      new Map<string, CborValue>([['v', 1], ['box_id', new Uint8Array(16)], ['profile', 'small'],
        ['tag', new Uint8Array(16)], ['size', 0], ['created_coarse', 0], ['chunk_size', 1234]]),
    ];
    for (const value of cases) {
      const encoded = encodeCbor(value, limits);
      expect(encoded.ok).toBe(true);
      if (encoded.ok) expect(decodeBoxHeader(encoded.value, limits)).toEqual({ ok: false, error: 'invalid-header' });
    }
  });

  it('propagates bounded CBOR failures and rejects non-byte input', () => {
    expect(decodeBoxHeader('bad', limits)).toEqual({ ok: false, error: 'invalid-cbor' });
    expect(decodeBoxHeader(new Uint8Array(20), { maxBytes: 4, maxDepth: 4, maxItems: 32 }))
      .toEqual({ ok: false, error: 'limit-exceeded' });
    expect(encodeBoxHeader(header, { maxBytes: 4, maxDepth: 4, maxItems: 32 }))
      .toEqual({ ok: false, error: 'limit-exceeded' });
  });
});
