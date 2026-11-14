import { decode, encode, rfc8949EncodeOptions, Tokenizer } from 'cborg';
import type { Token } from 'cborg';
import { encodedLength } from 'cborg/length';

export type CborValue = null | boolean | number | bigint | string | Uint8Array
  | CborValue[] | Map<CborValue, CborValue>;
export interface CborLimits {
  maxBytes: number;
  maxDepth: number;
  maxItems: number;
}
export type CborError = 'invalid-limits' | 'limit-exceeded' | 'unsupported-value'
  | 'invalid-cbor' | 'non-deterministic';
export type CborResult<T> = { ok: true; value: T } | { ok: false; error: CborError };

class CodecFailure extends Error {
  readonly code: CborError;
  constructor(code: CborError) {
    super(code);
    this.code = code;
  }
}

function requireBound(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new CodecFailure('invalid-limits');
  }
  return value;
}

function readLimits(value: unknown): CborLimits {
  if (!value || typeof value !== 'object') throw new CodecFailure('invalid-limits');
  const fields = value as Record<string, unknown>;
  return { maxBytes: requireBound(fields.maxBytes), maxDepth: requireBound(fields.maxDepth),
    maxItems: requireBound(fields.maxItems) };
}

interface EncodeBudget {
  limits: CborLimits;
  items: number;
  bytes: number;
  ancestors: Set<object>;
}

function chargeBytes(budget: EncodeBudget, count: number): void {
  if (count > budget.limits.maxBytes - budget.bytes) throw new CodecFailure('limit-exceeded');
  budget.bytes += count;
}

function snapshot(value: unknown, budget: EncodeBudget, depth: number): CborValue {
  budget.items += 1;
  if (budget.items > budget.limits.maxItems) throw new CodecFailure('limit-exceeded');
  chargeBytes(budget, 1); // Every value needs at least one CBOR header byte.
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new CodecFailure('unsupported-value');
    return value;
  }
  if (typeof value === 'bigint') {
    if (value < -(1n << 64n) || value >= (1n << 64n)) throw new CodecFailure('unsupported-value');
    return value;
  }
  if (typeof value === 'string') {
    // Bound allocation before UTF-8 conversion, then reject lossy UTF-16 input.
    if (value.length > budget.limits.maxBytes - budget.bytes) throw new CodecFailure('limit-exceeded');
    const utf8 = new TextEncoder().encode(value);
    chargeBytes(budget, utf8.byteLength);
    if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(utf8) !== value) {
      throw new CodecFailure('unsupported-value');
    }
    return value;
  }
  if (value instanceof Uint8Array) {
    chargeBytes(budget, value.byteLength);
    return new Uint8Array(value);
  }
  if (typeof value !== 'object') throw new CodecFailure('unsupported-value');
  if (depth >= budget.limits.maxDepth) throw new CodecFailure('limit-exceeded');
  if (budget.ancestors.has(value)) throw new CodecFailure('unsupported-value');
  budget.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > budget.limits.maxItems - budget.items) throw new CodecFailure('limit-exceeded');
      if (Reflect.ownKeys(value).length !== value.length + 1) throw new CodecFailure('unsupported-value');
      const array: CborValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !('value' in descriptor)) throw new CodecFailure('unsupported-value');
        array.push(snapshot(descriptor.value, budget, depth + 1));
      }
      return array;
    }
    const map = new Map<CborValue, CborValue>();
    if (value instanceof Map) {
      if (value.size > (budget.limits.maxItems - budget.items) / 2) throw new CodecFailure('limit-exceeded');
      for (const [key, entry] of value) {
        map.set(snapshot(key, budget, depth + 1), snapshot(entry, budget, depth + 1));
      }
      return map;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new CodecFailure('unsupported-value');
    const keys = Reflect.ownKeys(value);
    if (keys.length > (budget.limits.maxItems - budget.items) / 2) throw new CodecFailure('limit-exceeded');
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor?.enumerable || !('value' in descriptor)) {
        throw new CodecFailure('unsupported-value');
      }
      map.set(snapshot(key, budget, depth + 1), snapshot(descriptor.value, budget, depth + 1));
    }
    return map;
  } finally {
    budget.ancestors.delete(value);
  }
}

const decodeOptions = {
  strict: true, useMaps: true, allowBigInt: true, allowIndefinite: false,
  allowUndefined: false, coerceUndefinedToNull: false, allowInfinity: false,
  allowNaN: false, rejectDuplicateMapKeys: true, rejectInvalidUtf8: true,
};
const allowedTokens = new Set(['uint', 'negint', 'bytes', 'string', 'array', 'map', 'false', 'true', 'null']);

/** Tracks definite container slots before cborg recursively constructs objects. */
class BoundedTokenizer extends Tokenizer {
  private readonly remaining = [1];
  private items = 0;
  private readonly limits: CborLimits;

  constructor(bytes: Uint8Array, limits: CborLimits) {
    super(bytes, decodeOptions);
    this.limits = limits;
  }

  override next(): Token {
    this.items += 1;
    if (this.items > this.limits.maxItems) throw new CodecFailure('limit-exceeded');
    while (this.remaining.at(-1) === 0) this.remaining.pop();
    const slots = this.remaining.pop();
    if (slots === undefined) throw new CodecFailure('invalid-cbor');
    this.remaining.push(slots - 1);
    const token = super.next();
    if (!allowedTokens.has(token.type.name)) throw new CodecFailure('unsupported-value');
    if (token.type.name === 'array' || token.type.name === 'map') {
      if (this.remaining.length > this.limits.maxDepth) throw new CodecFailure('limit-exceeded');
      const length: unknown = token.value;
      if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) {
        throw new CodecFailure('invalid-cbor');
      }
      const count = length * (token.type.name === 'map' ? 2 : 1);
      if (count > this.limits.maxItems - this.items) throw new CodecFailure('limit-exceeded');
      this.remaining.push(count);
    }
    return token;
  }
}

export function encodeCbor(value: unknown, limits: CborLimits): CborResult<Uint8Array> {
  try {
    const bounds = readLimits(limits);
    const copy = snapshot(value, { limits: bounds, items: 0, bytes: 0, ancestors: new Set() }, 0);
    if (encodedLength(copy, rfc8949EncodeOptions) > bounds.maxBytes) throw new CodecFailure('limit-exceeded');
    return { ok: true, value: encode(copy, rfc8949EncodeOptions) };
  } catch (error) {
    return { ok: false, error: error instanceof CodecFailure ? error.code : 'unsupported-value' };
  }
}

export function decodeCbor(input: unknown, limits: CborLimits): CborResult<CborValue> {
  try {
    const bounds = readLimits(limits);
    if (!(input instanceof Uint8Array)) throw new CodecFailure('invalid-cbor');
    if (input.byteLength > bounds.maxBytes) throw new CodecFailure('limit-exceeded');
    const bytes = new Uint8Array(input);
    const value: unknown = decode(bytes, { ...decodeOptions, tokenizer: new BoundedTokenizer(bytes, bounds) });
    const canonical = encodeCbor(value, bounds);
    if (!canonical.ok) return canonical;
    if (canonical.value.byteLength !== bytes.byteLength
      || !bytes.every((byte, index) => byte === canonical.value[index])) {
      throw new CodecFailure('non-deterministic');
    }
    return { ok: true, value: value as CborValue };
  } catch (error) {
    return { ok: false, error: error instanceof CodecFailure ? error.code : 'invalid-cbor' };
  }
}
