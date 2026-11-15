import { readFile } from 'node:fs/promises';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import * as pako from 'pako';
import { compressDeflate, decompressDeflate } from './src/compression.js';

vi.mock('pako', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pako')>();
  return { ...actual, zlibInflate: vi.fn(actual.zlibInflate) };
});

const bytes = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, 'hex'));
const limits = { maxInputBytes: 6 * 1024 * 1024, maxOutputBytes: 6 * 1024 * 1024 };

describe('Phase 1 bounded deflate candidate acceptance', () => {
  it('VEC-DEFLATE decodes independent RFC 1950 fixtures and rejects malformed streams', async () => {
    const json: unknown = JSON.parse(await readFile(new URL('../test-vectors/deflate.json', import.meta.url), 'utf8'));
    const document = json as { vectors: { input_hex: string; deflate_hex: string }[];
      rejections: { deflate_hex: string }[] };
    for (const vector of document.vectors) {
      expect(await decompressDeflate(bytes(vector.deflate_hex), limits))
        .toEqual({ ok: true, value: bytes(vector.input_hex) });
    }
    for (const vector of document.rejections) {
      expect(await decompressDeflate(bytes(vector.deflate_hex), limits))
        .toEqual({ ok: false, error: 'invalid-data' });
    }
  });

  it('DEFLATE-ROUNDTRIP interoperates with the classic zlib API from empty through 5 MiB', async () => {
    let state = 0x44460001;
    for (const length of [0, 1, 1024, 16384, 5 * 1024 * 1024]) {
      const input = Uint8Array.from({ length }, () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state >>> 24;
      });
      const compressed = await compressDeflate(input, limits);
      if (!compressed.ok) throw new Error(compressed.error);
      expect(new Uint8Array(inflateSync(compressed.value))).toEqual(input);
      expect(await decompressDeflate(compressed.value, limits)).toEqual({ ok: true, value: input });
      expect(await decompressDeflate(new Uint8Array(deflateSync(input)), limits)).toEqual({ ok: true, value: input });
    }
  });

  it('DEFLATE-BOUNDS rejects expansion above the exact output budget and returns zero partial bytes', async () => {
    const compressed = new Uint8Array(deflateSync(new Uint8Array(1024 * 1024)));
    expect(await decompressDeflate(compressed, { maxInputBytes: compressed.length, maxOutputBytes: 16384 }))
      .toEqual({ ok: false, error: 'limit-exceeded' });
    const small = new Uint8Array(deflateSync(new Uint8Array(1025)));
    expect(await decompressDeflate(small, { maxInputBytes: small.length, maxOutputBytes: 1024 }))
      .toEqual({ ok: false, error: 'limit-exceeded' });
    expect(await decompressDeflate(small, { maxInputBytes: small.length, maxOutputBytes: 1025 }))
      .toEqual({ ok: true, value: new Uint8Array(1025) });
    expect(await decompressDeflate(new Uint8Array(deflateSync(new Uint8Array())), { maxInputBytes: 32, maxOutputBytes: 0 }))
      .toEqual({ ok: true, value: new Uint8Array() });
    expect(await compressDeflate(new Uint8Array(), { maxInputBytes: 0, maxOutputBytes: 0 }))
      .toEqual({ ok: false, error: 'limit-exceeded' });
  });

  it('DEFLATE-INPUT rejects invalid inputs and limits before constructing a codec', async () => {
    const construct = vi.spyOn(globalThis, 'CompressionStream');
    try {
      for (const invalid of [null, 'bytes', new ArrayBuffer(1)]) {
        expect(await compressDeflate(invalid, limits)).toEqual({ ok: false, error: 'invalid-input' });
      }
      for (const invalid of [-1, 0.1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        expect(await compressDeflate(new Uint8Array(), { ...limits, maxInputBytes: invalid }))
          .toEqual({ ok: false, error: 'invalid-limits' });
      }
      expect(await compressDeflate(new Uint8Array(2), { maxInputBytes: 1, maxOutputBytes: 32 }))
        .toEqual({ ok: false, error: 'limit-exceeded' });
      const detached = new Uint8Array(1);
      structuredClone(detached.buffer, { transfer: [detached.buffer] });
      expect(await compressDeflate(detached, limits)).toEqual({ ok: false, error: 'invalid-input' });
      expect(construct).not.toHaveBeenCalled();
    } finally {
      construct.mockRestore();
    }
  });

  it('DEFLATE-SNAPSHOT owns input and limits before asynchronous processing', async () => {
    const input = new Uint8Array(65536).fill(42);
    const mutable = { ...limits };
    const pending = compressDeflate(input, mutable);
    input.fill(0);
    mutable.maxOutputBytes = 0;
    const compressed = await pending;
    if (!compressed.ok) throw new Error(compressed.error);
    const pendingOpen = decompressDeflate(compressed.value, limits);
    compressed.value.fill(0);
    expect(await pendingOpen).toEqual({ ok: true, value: new Uint8Array(65536).fill(42) });
  });

  it('DEFLATE-UNAVAILABLE reports a missing native compressor and retains decoder availability', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    vi.stubGlobal('DecompressionStream', undefined);
    try {
      expect(await compressDeflate(new Uint8Array(), limits)).toEqual({ ok: false, error: 'unsupported-compression' });
      expect(await decompressDeflate(new Uint8Array(deflateSync(new Uint8Array())), limits))
        .toEqual({ ok: true, value: new Uint8Array() });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('DEFLATE-CANCEL settles both stream stages after an output-budget failure', async () => {
    let fed = 0;
    const codec = new TransformStream<Uint8Array, Uint8Array>({
      transform(piece, controller) {
        fed += piece.length;
        controller.enqueue(new Uint8Array(33));
      },
    });
    vi.stubGlobal('CompressionStream', class {
      readonly readable = codec.readable;
      readonly writable = codec.writable;
    });
    try {
      expect(await compressDeflate(new Uint8Array(10240), { maxInputBytes: 10240, maxOutputBytes: 32 }))
        .toEqual({ ok: false, error: 'limit-exceeded' });
      expect(fed).toBeLessThan(10240);
      expect(codec.readable.locked).toBe(false);
      expect(codec.writable.locked).toBe(false);
      await expect(codec.writable.getWriter().closed).rejects.toMatchObject({ code: 'limit-exceeded' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('DEFLATE-WORKSPACE stops after the output budget plus one byte in caller-owned buffers', async () => {
    const compressed = new Uint8Array(deflateSync(new Uint8Array(8 * 1024 * 1024)));
    const original = await vi.importActual<typeof import('pako')>('pako');
    let produced = 0;
    let maximumBuffer = 0;
    const end = vi.spyOn(pako, 'zlibInflateEnd');
    const inflate = vi.spyOn(pako, 'zlibInflate').mockImplementation((stream, flush) => {
      const status = original.zlibInflate(stream, flush);
      produced = stream.total_out;
      maximumBuffer = Math.max(maximumBuffer, stream.output.length);
      return status;
    });
    try {
      expect(await decompressDeflate(compressed, { maxInputBytes: compressed.length, maxOutputBytes: 16384 }))
        .toEqual({ ok: false, error: 'limit-exceeded' });
      expect(produced).toBe(16385);
      expect(maximumBuffer).toBeLessThanOrEqual(16384);
      expect(end).toHaveBeenCalledTimes(1);
    } finally {
      inflate.mockRestore();
      end.mockRestore();
    }
  });

  it('FUZZ-DEFLATE returns typed failures for 1000 seeded malformed inputs', async () => {
    let state = 0x44460002;
    for (let trial = 0; trial < 1000; trial += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const input = Uint8Array.from({ length: state % 128 }, () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state >>> 24;
      });
      expect(await decompressDeflate(input, { maxInputBytes: 128, maxOutputBytes: 1024 }))
        .toEqual({ ok: false, error: 'invalid-data' });
    }
  });
});
