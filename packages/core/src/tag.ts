import { TAG_WINDOW } from './config.js';

const MAX_COUNTER = (1n << 64n) - 1n;
const DOMAIN = new TextEncoder().encode('om-tag-v1');

export type TagError = 'invalid-key' | 'invalid-counter' | 'counter-exhausted' | 'unsupported-crypto';
export type TagResult<T> = { ok: true; value: T } | { ok: false; error: TagError };

/** docs/04 section 5. The input key is the 256-bit K_tag, supplied by the caller. */
export async function deriveTag(rawKey: unknown, counter: unknown): Promise<TagResult<Uint8Array>> {
  if (!(rawKey instanceof Uint8Array) || rawKey.byteLength !== 32) {
    return { ok: false, error: 'invalid-key' };
  }
  if (typeof counter !== 'bigint' || counter < 0n || counter > MAX_COUNTER) {
    return { ok: false, error: 'invalid-counter' };
  }
  try {
    const input = new Uint8Array(DOMAIN.byteLength + 8);
    input.set(DOMAIN);
    new DataView(input.buffer).setBigUint64(DOMAIN.byteLength, counter, false);
    const key = await globalThis.crypto.subtle.importKey(
      'raw', new Uint8Array(rawKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const mac = await globalThis.crypto.subtle.sign('HMAC', key, input);
    return { ok: true, value: new Uint8Array(mac).slice(0, 16) };
  } catch {
    return { ok: false, error: 'unsupported-crypto' };
  }
}

/** A bounded, clock-independent lookahead that rejects counter wrap. */
export async function deriveTagWindow(
  rawKey: unknown, next: unknown,
): Promise<TagResult<Uint8Array[]>> {
  if (typeof next !== 'bigint' || next < 0n || next > MAX_COUNTER) {
    return { ok: false, error: 'invalid-counter' };
  }
  if (next > MAX_COUNTER - BigInt(TAG_WINDOW - 1)) {
    return { ok: false, error: 'counter-exhausted' };
  }
  const tags: Uint8Array[] = [];
  for (let offset = 0; offset < TAG_WINDOW; offset += 1) {
    const result = await deriveTag(rawKey, next + BigInt(offset));
    if (!result.ok) return result;
    tags.push(result.value);
  }
  return { ok: true, value: tags };
}
