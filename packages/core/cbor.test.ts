import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { decodeCbor, encodeCbor } from './src/cbor.js';

const limits = { maxBytes: 16_384, maxDepth: 16, maxItems: 4096 };
const bytes = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, 'hex'));

function fixture(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fixture);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.$int === 'string') return BigInt(record.$int);
    if (typeof record.$bytes === 'string') return bytes(record.$bytes);
    if (Array.isArray(record.$map)) {
      return new Map(record.$map.map((entry: unknown) => {
        if (!Array.isArray(entry) || entry.length !== 2) throw new Error('Invalid map fixture');
        return [fixture(entry[0]), fixture(entry[1])];
      }));
    }
    throw new Error('Invalid fixture');
  }
  return value;
}

describe('Phase 1 deterministic CBOR acceptance', () => {
  it('VEC-CBOR matches independent deterministic vectors', async () => {
    const json: unknown = JSON.parse(await readFile(new URL('../test-vectors/cbor.json', import.meta.url), 'utf8'));
    const data = json as { vectors: { id: string; value: unknown; cbor_hex: string }[] };
    expect(data.vectors.length).toBeGreaterThanOrEqual(16);
    for (const vector of data.vectors) {
      const expected = bytes(vector.cbor_hex);
      expect(encodeCbor(fixture(vector.value), limits), vector.id).toEqual({ ok: true, value: expected });
      const result = decodeCbor(expected, limits);
      expect(result.ok, vector.id).toBe(true);
      if (result.ok) expect(encodeCbor(result.value, limits), vector.id).toEqual({ ok: true, value: expected });
    }
  });

  it('CBOR-ORDER gives identical bytes for all map insertion orders', () => {
    const pairs: [unknown, unknown][] = [[24, 'uint'], [-1, 'negative'], ['a', 'text']];
    const first = encodeCbor(new Map(pairs), limits);
    expect(first.ok).toBe(true);
    for (let offset = 0; offset < pairs.length; offset += 1) {
      expect(encodeCbor(new Map([...pairs.slice(offset), ...pairs.slice(0, offset)]), limits)).toEqual(first);
    }
    expect(encodeCbor({ z: 1, a: 2 }, limits)).toEqual(encodeCbor({ a: 2, z: 1 }, limits));
  });

  it('CBOR-STRICT rejects malformed, noncanonical and unsupported wire values', () => {
    for (const hex of [
      '', '18', '1800', '9fff', '5f4100ff', '0000', 'a2616200616100',
      'a2616100616101', 'a2410000410001', '61ff', '62c080', 'c000',
      'f7', 'f97e00', 'f97c00', 'fa3f800000', '1b', '590001',
    ]) {
      expect(decodeCbor(bytes(hex), limits).ok, hex).toBe(false);
    }
  });

  it('CBOR-LIMIT caps bytes, nesting, tokens and hostile declared lengths', () => {
    expect(encodeCbor(new Uint8Array(16_384), limits)).toEqual({ ok: false, error: 'limit-exceeded' });
    expect(decodeCbor(new Uint8Array(16_385), limits)).toEqual({ ok: false, error: 'limit-exceeded' });
    expect(encodeCbor([[0]], { ...limits, maxDepth: 1 })).toEqual({ ok: false, error: 'limit-exceeded' });
    expect(decodeCbor(bytes('818100'), { ...limits, maxDepth: 1 })).toEqual({ ok: false, error: 'limit-exceeded' });
    expect(encodeCbor([0, 1], { ...limits, maxItems: 2 })).toEqual({ ok: false, error: 'limit-exceeded' });
    expect(decodeCbor(bytes('820001'), { ...limits, maxItems: 2 })).toEqual({ ok: false, error: 'limit-exceeded' });
    for (const hex of ['9affffffff', 'baffffffff', '5bffffffffffffffff', '7bffffffffffffffff']) {
      expect(decodeCbor(bytes(hex), limits).ok).toBe(false);
    }
    expect(decodeCbor(bytes('81'.repeat(8192) + '00'), limits)).toEqual({ ok: false, error: 'limit-exceeded' });
    expect(encodeCbor(new Uint8Array(16_381), limits).ok).toBe(true);
  });

  it('CBOR-GRAPH rejects cycles, invalid strings, unsafe values and expanding graphs', () => {
    const cycle: unknown[] = [];
    cycle.push(cycle);
    let expanding: unknown = 0;
    for (let index = 0; index < 30; index += 1) expanding = [expanding, expanding];
    let getterCalls = 0;
    const getter = Object.defineProperty({}, 'x', {
      enumerable: true, get() { getterCalls += 1; return 0; },
    });
    for (const value of [undefined, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1,
      -0, 1n << 64n, -(1n << 64n) - 1n, new Date(), new Set(), new Uint16Array(1),
      '\ud800', '\udfff', cycle, getter, new Map<number | bigint, string>([[1, 'number'], [1n, 'bigint']])]) {
      expect(encodeCbor(value, limits).ok).toBe(false);
    }
    expect(getterCalls).toBe(0);
    expect(encodeCbor(expanding, { ...limits, maxDepth: 64 })).toEqual({ ok: false, error: 'limit-exceeded' });
  });

  it('CBOR-BOUNDARY preserves BOM, Unicode, uint64 and prototype-named keys', () => {
    const value = new Map<unknown, unknown>([
      ['__proto__', 'ordinary data'], ['unicode', '\ufeffhé🙂'], ['max', (1n << 64n) - 1n],
    ]);
    const result = encodeCbor(value, limits);
    expect(result.ok).toBe(true);
    if (result.ok) expect(decodeCbor(result.value, limits)).toEqual({ ok: true, value });
    const wire = bytes('420102');
    const decoded = decodeCbor(wire, limits);
    wire.fill(0);
    expect(decoded).toEqual({ ok: true, value: bytes('0102') });
  });

  it('CBOR-INPUT returns typed results for invalid limits and byte inputs', () => {
    for (const field of ['maxBytes', 'maxDepth', 'maxItems'] as const) {
      for (const bound of [0, -1, 1.5, NaN, Infinity]) {
        const invalid = { ...limits, [field]: bound };
        expect(encodeCbor(0, invalid)).toEqual({ ok: false, error: 'invalid-limits' });
        expect(decodeCbor(bytes('00'), invalid)).toEqual({ ok: false, error: 'invalid-limits' });
      }
    }
    expect(decodeCbor('00', limits)).toEqual({ ok: false, error: 'invalid-cbor' });
  });

  it('FUZZ-CBOR handles 5000 seeded malformed/corrupted inputs', () => {
    const started = performance.now();
    let state = 0x4f4d0001;
    let accepted = 0;
    let slowest = 0;
    const corpus = ['00', '01', 'a26161006162820102', '83000102', '43010203', '6461626364'].map(bytes);
    for (let trial = 0; trial < 5000; trial += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const input = new Uint8Array(state % 1024);
      for (let index = 0; index < input.length; index += 1) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        input[index] = state >>> 24;
      }
      let candidate = input;
      if (trial % 2 === 0) {
        const seed = corpus[state % corpus.length];
        if (!seed) throw new Error('Missing fuzz seed');
        candidate = new Uint8Array(seed);
        const view = new DataView(candidate.buffer);
        const offset = state % candidate.length;
        view.setUint8(offset, view.getUint8(offset) ^ (1 << ((state >>> 8) % 8)));
      }
      const before = performance.now();
      const result = decodeCbor(candidate, limits);
      slowest = Math.max(slowest, performance.now() - before);
      if (result.ok) {
        accepted += 1;
        expect(encodeCbor(result.value, limits)).toEqual({ ok: true, value: candidate });
      }
    }
    expect(accepted).toBeGreaterThan(0);
    expect(slowest).toBeLessThan(1000);
    console.log(JSON.stringify({ test: 'FUZZ-CBOR', seed: '0x4f4d0001', cases: 5000,
      accepted, elapsed_ms: performance.now() - started, slowest_decode_ms: slowest }));
  });
});

it('CBOR-ARRAY-CAP rejects a collection head before constructing or reading its elements', () => {
  const bounded = { ...limits, maxArrayLength: 20 };
  expect(decodeCbor(new Uint8Array([0x95]), bounded))
    .toEqual({ ok: false, error: 'limit-exceeded' });
  expect(encodeCbor(Array.from({ length: 21 }, () => 0), bounded))
    .toEqual({ ok: false, error: 'limit-exceeded' });
});
