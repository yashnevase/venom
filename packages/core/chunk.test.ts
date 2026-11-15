import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { chunkSizeForFile, identifyChunk, verifyChunk } from './src/chunk.js';

const bytes = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, 'hex'));
const referenceHash = (input: Uint8Array): Uint8Array => new Uint8Array(createHash('sha256').update(input).digest());

describe('Phase 1 chunk integrity acceptance', () => {
  it('VEC-CHUNK matches independent hash and size vectors', async () => {
    const json: unknown = JSON.parse(await readFile(new URL('../test-vectors/chunks.json', import.meta.url), 'utf8'));
    const data = json as {
      hash_vectors: { id: string; input: { hex?: string; length?: number }; sha256_hex: string }[];
      size_vectors: { file_size: string; chunk_size: number }[];
    };
    expect(data.hash_vectors).toHaveLength(10);
    expect(data.size_vectors).toHaveLength(9);
    for (const vector of data.hash_vectors) {
      const input = vector.input.hex === undefined
        ? Uint8Array.from({ length: vector.input.length ?? 0 }, (_, index) => index % 251)
        : bytes(vector.input.hex);
      const result = await identifyChunk(input, input.byteLength);
      expect(result, vector.id).toEqual({ ok: true, value: { bytes: input, chunkId: bytes(vector.sha256_hex) } });
      expect(await verifyChunk(input, bytes(vector.sha256_hex), input.byteLength), vector.id)
        .toEqual({ ok: true, value: input });
    }
    for (const vector of data.size_vectors) {
      expect(chunkSizeForFile(BigInt(vector.file_size))).toEqual({ ok: true, value: vector.chunk_size });
    }
  });

  it('CHUNK-SIZE follows inclusive file-size boundaries for Number and bigint inputs', () => {
    const first = 64n * 1024n * 1024n;
    const second = 16n * 1024n * 1024n * 1024n;
    expect(chunkSizeForFile(0)).toEqual({ ok: true, value: 65_536 });
    expect(chunkSizeForFile(Number(first))).toEqual({ ok: true, value: 65_536 });
    expect(chunkSizeForFile(first + 1n)).toEqual({ ok: true, value: 262_144 });
    expect(chunkSizeForFile(second)).toEqual({ ok: true, value: 262_144 });
    expect(chunkSizeForFile(second + 1n)).toEqual({ ok: true, value: 1_048_576 });
    for (const invalid of [-1, -1n, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
      1n << 64n, '0', null, undefined]) {
      expect(chunkSizeForFile(invalid)).toEqual({ ok: false, error: 'invalid-size' });
    }
  });

  it('CHUNK-BOUND caps one chunk before hashing and rejects invalid IDs', async () => {
    const input = new Uint8Array(65_536);
    const expected = referenceHash(input);
    expect((await identifyChunk(input, 65_536)).ok).toBe(true);
    expect(await identifyChunk(input, 65_535)).toEqual({ ok: false, error: 'limit-exceeded' });
    for (const limit of [-1, 1.5, NaN, Infinity]) {
      expect(await identifyChunk(input, limit)).toEqual({ ok: false, error: 'invalid-limit' });
    }
    for (const invalid of [null, undefined, 'bytes', [1, 2], new Uint16Array(2)]) {
      expect(await identifyChunk(invalid, 65_536)).toEqual({ ok: false, error: 'invalid-chunk' });
    }
    for (const invalid of [null, '', new Uint8Array(31), new Uint8Array(33)]) {
      expect(await verifyChunk(input, invalid, 65_536)).toEqual({ ok: false, error: 'invalid-id' });
    }
    expect(await verifyChunk(input, expected, 65_535)).toEqual({ ok: false, error: 'limit-exceeded' });
    expect((await identifyChunk(new Uint8Array(), 0)).ok).toBe(true);
    const detached = new Uint8Array([1]);
    structuredClone(detached.buffer, { transfer: [detached.buffer] });
    expect(await identifyChunk(detached, 1)).toEqual({ ok: false, error: 'invalid-chunk' });
  });

  it('CHUNK-CORRUPTION rejects every single-bit change in a 64-byte fixture', async () => {
    const input = Uint8Array.from({ length: 64 }, (_, index) => index);
    const expected = referenceHash(input);
    for (let bit = 0; bit < input.byteLength * 8; bit += 1) {
      const corrupted = new Uint8Array(input);
      const view = new DataView(corrupted.buffer);
      const index = Math.floor(bit / 8);
      view.setUint8(index, view.getUint8(index) ^ (1 << (bit % 8)));
      expect(await verifyChunk(corrupted, expected, 64)).toEqual({ ok: false, error: 'hash-mismatch' });
    }
    for (let bit = 0; bit < expected.byteLength * 8; bit += 1) {
      const corruptedId = new Uint8Array(expected);
      const view = new DataView(corruptedId.buffer);
      const index = Math.floor(bit / 8);
      view.setUint8(index, view.getUint8(index) ^ (1 << (bit % 8)));
      expect(await verifyChunk(input, corruptedId, 64)).toEqual({ ok: false, error: 'hash-mismatch' });
    }
    expect(await verifyChunk(input.subarray(0, 63), expected, 64))
      .toEqual({ ok: false, error: 'hash-mismatch' });
  });

  it('CHUNK-POSITION rejects bytes checked against another position’s expected ID', async () => {
    const first = new Uint8Array([1, 2, 3]);
    const second = new Uint8Array([4, 5, 6]);
    expect(await verifyChunk(second, referenceHash(first), 3)).toEqual({ ok: false, error: 'hash-mismatch' });
    expect(await verifyChunk(first, referenceHash(second), 3)).toEqual({ ok: false, error: 'hash-mismatch' });
  });

  it('CHUNK-SNAPSHOT returns the bytes hashed before caller buffers change', async () => {
    const input = new Uint8Array([1, 2, 3]);
    const pending = identifyChunk(input, 3);
    input.fill(9);
    const result = await pending;
    expect(result).toEqual({ ok: true, value: {
      bytes: new Uint8Array([1, 2, 3]), chunkId: referenceHash(new Uint8Array([1, 2, 3])),
    } });
    const candidate = new Uint8Array([4, 5, 6]);
    const expected = referenceHash(candidate);
    const verification = verifyChunk(candidate, expected, 3);
    candidate.fill(0);
    expected.fill(0);
    expect(await verification).toEqual({ ok: true, value: new Uint8Array([4, 5, 6]) });
  });

  it('CHUNK-PROPERTY agrees with Node SHA-256 over 128 deterministic payloads', async () => {
    for (let index = 0; index < 128; index += 1) {
      const input = Uint8Array.from({ length: index * 509 }, (_, offset) => (offset + index) % 251);
      const result = await identifyChunk(input, 65_536);
      expect(result).toEqual({ ok: true, value: { bytes: input, chunkId: referenceHash(input) } });
    }
  });

  it('CHUNK-CRYPTO returns typed failure when native hashing is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);
    try {
      expect(await identifyChunk(new Uint8Array([1]), 1))
        .toEqual({ ok: false, error: 'unsupported-crypto' });
      expect(await verifyChunk(new Uint8Array([1]), new Uint8Array(32), 1))
        .toEqual({ ok: false, error: 'unsupported-crypto' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
