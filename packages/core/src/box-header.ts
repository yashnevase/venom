import { decodeCbor, encodeCbor } from './cbor.js';
import type { CborError, CborLimits, CborValue } from './cbor.js';
import { CHUNK_SIZE_LARGE, CHUNK_SIZE_MEDIUM, CHUNK_SIZE_SMALL } from './config.js';

export type BoxProfile = 'small' | 'chunked' | 'fountain';
export interface BoxHeader {
  v: 1;
  box_id: Uint8Array;
  profile: BoxProfile;
  tag: Uint8Array;
  size: bigint;
  chunk_size?: bigint;
  manifest_hash?: Uint8Array;
  created_coarse: bigint;
}
export type BoxHeaderInput = Omit<BoxHeader, 'size' | 'chunk_size' | 'created_coarse'> & {
  size: number | bigint;
  chunk_size?: number | bigint;
  created_coarse: number | bigint;
};
export type BoxHeaderError = CborError | 'invalid-header' | 'unsupported-version';
export type BoxHeaderResult<T> = { ok: true; value: T } | { ok: false; error: BoxHeaderError };

const keys = new Set(['v', 'box_id', 'profile', 'tag', 'size', 'chunk_size', 'manifest_hash', 'created_coarse']);
const maxUint64 = (1n << 64n) - 1n;
const chunkSizes = new Set([BigInt(CHUNK_SIZE_SMALL), BigInt(CHUNK_SIZE_MEDIUM), BigInt(CHUNK_SIZE_LARGE)]);

function asUint(value: unknown, positive = false): bigint | undefined {
  let result: bigint;
  if (typeof value === 'bigint') result = value;
  else if (typeof value === 'number' && Number.isSafeInteger(value)) result = BigInt(value);
  else return undefined;
  if (result < (positive ? 1n : 0n) || result > maxUint64) return undefined;
  return result;
}

function asBytes(value: unknown, length: number): Uint8Array | undefined {
  if (!(value instanceof Uint8Array) || value.byteLength !== length) return undefined;
  return new Uint8Array(value);
}

function parseHeader(value: CborValue): BoxHeaderResult<BoxHeader> {
  if (!(value instanceof Map)) return { ok: false, error: 'invalid-header' };
  const version = asUint(value.get('v'));
  if (version === undefined) return { ok: false, error: 'invalid-header' };
  if (version !== 1n) return { ok: false, error: 'unsupported-version' };
  for (const key of value.keys()) {
    if (typeof key !== 'string' || !keys.has(key)) return { ok: false, error: 'invalid-header' };
  }

  const boxId = asBytes(value.get('box_id'), 16);
  const profile = value.get('profile');
  const tag = asBytes(value.get('tag'), 16);
  const size = asUint(value.get('size'));
  const createdCoarse = asUint(value.get('created_coarse'));
  const chunkSize = value.has('chunk_size') ? asUint(value.get('chunk_size'), true) : undefined;
  const manifestHash = value.has('manifest_hash') ? asBytes(value.get('manifest_hash'), 32) : undefined;

  if (!boxId || !tag || size === undefined || createdCoarse === undefined
    || (profile !== 'small' && profile !== 'chunked' && profile !== 'fountain')
    || (value.has('chunk_size') && (chunkSize === undefined || !chunkSizes.has(chunkSize)))
    || (value.has('manifest_hash') && !manifestHash)) {
    return { ok: false, error: 'invalid-header' };
  }
  return { ok: true, value: {
    v: 1, box_id: boxId, profile, tag, size, created_coarse: createdCoarse,
    ...(chunkSize === undefined ? {} : { chunk_size: chunkSize }),
    ...(manifestHash === undefined ? {} : { manifest_hash: manifestHash }),
  } };
}

function inputMap(input: unknown): BoxHeaderResult<Map<CborValue, CborValue>> {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, error: 'invalid-header' };
    }
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return { ok: false, error: 'invalid-header' };
    const entries = new Map<CborValue, CborValue>();
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== 'string' || !keys.has(key)) return { ok: false, error: 'invalid-header' };
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) return { ok: false, error: 'invalid-header' };
      entries.set(key, descriptor.value as CborValue);
    }
    const version = asUint(entries.get('v'));
    if (version === undefined) return { ok: false, error: 'invalid-header' };
    if (version !== 1n) return { ok: false, error: 'unsupported-version' };
    const parsed = parseHeader(entries);
    return parsed.ok ? { ok: true, value: entries } : parsed;
  } catch {
    return { ok: false, error: 'invalid-header' };
  }
}

/** Encode only the CBOR header item. This does not define Header||SealedPayload framing. */
export function encodeBoxHeader(input: unknown, limits: CborLimits): BoxHeaderResult<Uint8Array> {
  const entries = inputMap(input);
  if (!entries.ok) return entries;
  return encodeCbor(entries.value, limits);
}

/** Decode only an already-delimited CBOR header item; no sealed payload is opened here. */
export function decodeBoxHeader(input: unknown, limits: CborLimits): BoxHeaderResult<BoxHeader> {
  const decoded = decodeCbor(input, limits);
  if (!decoded.ok) return decoded;
  return parseHeader(decoded.value);
}
