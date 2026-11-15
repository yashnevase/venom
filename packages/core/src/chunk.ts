import {
  CHUNK_SIZE_SMALL, CHUNK_SIZE_MEDIUM, CHUNK_SIZE_LARGE,
  SMALL_FILE_MAX_BYTES, MEDIUM_FILE_MAX_BYTES,
} from './config.js';

export type ChunkError = 'invalid-size' | 'invalid-limit' | 'invalid-chunk'
  | 'invalid-id' | 'limit-exceeded' | 'hash-mismatch' | 'unsupported-crypto';
export type ChunkResult<T> = { ok: true; value: T } | { ok: false; error: ChunkError };
export interface IdentifiedChunk {
  bytes: Uint8Array;
  chunkId: Uint8Array;
}

/** docs/11 section 1, with file sizes represented exactly as uint64 values. */
export function chunkSizeForFile(fileSize: unknown): ChunkResult<number> {
  let size = fileSize;
  if (typeof size === 'number') {
    if (!Number.isSafeInteger(size)) return { ok: false, error: 'invalid-size' };
    size = BigInt(size);
  }
  if (typeof size !== 'bigint' || size < 0n || size >= (1n << 64n)) {
    return { ok: false, error: 'invalid-size' };
  }
  if (size <= SMALL_FILE_MAX_BYTES) return { ok: true, value: CHUNK_SIZE_SMALL };
  if (size <= MEDIUM_FILE_MAX_BYTES) return { ok: true, value: CHUNK_SIZE_MEDIUM };
  return { ok: true, value: CHUNK_SIZE_LARGE };
}

function snapshotChunk(input: unknown, maxBytes: number): ChunkResult<Uint8Array> {
  try {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) return { ok: false, error: 'invalid-limit' };
    if (!(input instanceof Uint8Array)) return { ok: false, error: 'invalid-chunk' };
    if (input.byteLength > maxBytes) return { ok: false, error: 'limit-exceeded' };
    return { ok: true, value: new Uint8Array(input) };
  } catch {
    return { ok: false, error: 'invalid-chunk' };
  }
}

/** Identify opaque ciphertext bytes and retain the exact snapshot that was hashed. */
export async function identifyChunk(input: unknown, maxBytes: number): Promise<ChunkResult<IdentifiedChunk>> {
  const snapshot = snapshotChunk(input, maxBytes);
  if (!snapshot.ok) return snapshot;
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', snapshot.value);
    return { ok: true, value: { bytes: snapshot.value, chunkId: new Uint8Array(digest) } };
  } catch {
    return { ok: false, error: 'unsupported-crypto' };
  }
}

/** The caller obtains expectedId from its authenticated manifest and position. */
export async function verifyChunk(
  input: unknown, expectedId: unknown, maxBytes: number,
): Promise<ChunkResult<Uint8Array>> {
  let reference: Uint8Array;
  try {
    if (!(expectedId instanceof Uint8Array) || expectedId.byteLength !== 32) {
      return { ok: false, error: 'invalid-id' };
    }
    reference = new Uint8Array(expectedId);
  } catch {
    return { ok: false, error: 'invalid-id' };
  }
  const result = await identifyChunk(input, maxBytes);
  if (!result.ok) return result;
  if (!result.value.chunkId.every((byte, index) => byte === reference[index])) {
    return { ok: false, error: 'hash-mismatch' };
  }
  return { ok: true, value: result.value.bytes };
}
