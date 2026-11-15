import { ZStream, zlibInflateInit2, zlibInflate, zlibInflateEnd,
  Z_OK, Z_BUF_ERROR, Z_STREAM_END, Z_FINISH } from 'pako';
import { COMPRESSION_FEED_BYTES, DEFLATE_OUTPUT_BYTES } from './config.js';

export interface CompressionLimits {
  maxInputBytes: number;
  maxOutputBytes: number;
}
export type CompressionError = 'invalid-input' | 'invalid-limits' | 'limit-exceeded'
  | 'invalid-data' | 'unsupported-compression';
export type CompressionResult<T> = { ok: true; value: T } | { ok: false; error: CompressionError };

class CompressionFailure extends Error {
  readonly code: CompressionError;
  constructor(code: CompressionError) {
    super(code);
    this.code = code;
  }
}

function bound(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new CompressionFailure('invalid-limits');
  }
  return value;
}

function snapshot(input: unknown, limits: unknown) {
  if (!limits || typeof limits !== 'object') throw new CompressionFailure('invalid-limits');
  const fields = limits as Record<string, unknown>;
  const maxInputBytes = bound(fields.maxInputBytes);
  const maxOutputBytes = bound(fields.maxOutputBytes);
  if (!(input instanceof Uint8Array)) throw new CompressionFailure('invalid-input');
  if (input.byteLength > maxInputBytes) throw new CompressionFailure('limit-exceeded');
  try {
    return { owned: new Uint8Array(input), maxOutputBytes };
  } catch {
    throw new CompressionFailure('invalid-input');
  }
}

function failure(error: unknown): CompressionResult<never> {
  return { ok: false, error: error instanceof CompressionFailure ? error.code : 'invalid-data' };
}

function join(pieces: Uint8Array[], length: number): Uint8Array {
  const output = new Uint8Array(length);
  let position = 0;
  for (const piece of pieces) {
    output.set(piece, position);
    position += piece.byteLength;
  }
  return output;
}

export async function compressDeflate(
  input: unknown, limits: CompressionLimits,
): Promise<CompressionResult<Uint8Array>> {
  try {
    const { owned, maxOutputBytes } = snapshot(input, limits);
    let codec: CompressionStream;
    try {
      codec = new CompressionStream('deflate');
    } catch {
      throw new CompressionFailure('unsupported-compression');
    }
    let offset = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === owned.byteLength) {
          controller.close();
          return;
        }
        const end = Math.min(offset + COMPRESSION_FEED_BYTES, owned.byteLength);
        controller.enqueue(owned.subarray(offset, end));
        offset = end;
      },
    }, { highWaterMark: 0 });
    const pieces: Uint8Array[] = [];
    let length = 0;
    const sink = new WritableStream<Uint8Array>({
      write(piece) {
        if (piece.byteLength > maxOutputBytes - length) throw new CompressionFailure('limit-exceeded');
        pieces.push(piece);
        length += piece.byteLength;
      },
    });
    // Sink failures propagate upstream. Settle both stages before returning.
    const stages = await Promise.allSettled([
      // Native codec inputs accept BufferSource. Restrict the loose platform type.
      source.pipeTo(codec.writable as WritableStream<Uint8Array>), codec.readable.pipeTo(sink),
    ]);
    const rejected = stages.find((stage) => stage.status === 'rejected');
    if (rejected) throw rejected.reason;
    return { ok: true, value: join(pieces, length) };
  } catch (error) {
    return failure(error);
  }
}

export function decompressDeflate(input: unknown, limits: CompressionLimits): Promise<CompressionResult<Uint8Array>> {
  try {
    const { owned, maxOutputBytes } = snapshot(input, limits);
    const stream = new ZStream();
    if (zlibInflateInit2(stream, 15) !== Z_OK) throw new CompressionFailure('invalid-data');
    try {
      stream.input = owned;
      stream.next_in = 0;
      stream.avail_in = owned.byteLength;
      const pieces: Uint8Array[] = [];
      let length = 0;
      let status: ReturnType<typeof zlibInflate>;
      do {
        // One sentinel byte detects expansion beyond the remaining allowance.
        const output = new Uint8Array(Math.min(DEFLATE_OUTPUT_BYTES, maxOutputBytes - length + 1));
        stream.output = output;
        stream.next_out = 0;
        stream.avail_out = output.byteLength;
        status = zlibInflate(stream, Z_FINISH);
        if (stream.next_out > maxOutputBytes - length) throw new CompressionFailure('limit-exceeded');
        if (stream.next_out > 0) pieces.push(output.subarray(0, stream.next_out));
        length += stream.next_out;
        if (status !== Z_STREAM_END
          && ((status !== Z_OK && status !== Z_BUF_ERROR) || stream.avail_out !== 0)) {
          throw new CompressionFailure('invalid-data');
        }
      } while (status !== Z_STREAM_END);
      if (stream.avail_in !== 0) throw new CompressionFailure('invalid-data');
      return Promise.resolve({ ok: true, value: join(pieces, length) });
    } finally {
      zlibInflateEnd(stream);
    }
  } catch (error) {
    return Promise.resolve(failure(error));
  }
}
