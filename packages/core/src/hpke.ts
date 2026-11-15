import type { IdentityKeyPair } from './identity.js';

export type HpkeError = 'invalid-input' | 'invalid-key' | 'invalid-limits'
  | 'limit-exceeded' | 'authentication-failed' | 'unsupported-crypto';
export type HpkeResult<T> = { ok: true; value: T } | { ok: false; error: HpkeError };
export interface HpkeLimits {
  maxPlaintextBytes: number;
  maxContextBytes: number;
}
export interface HpkeContext {
  info: Uint8Array;
  aad: Uint8Array;
  limits: HpkeLimits;
}
export interface HpkeCiphertext {
  enc: Uint8Array;
  ciphertext: Uint8Array;
}

type Subtle = typeof globalThis.crypto.subtle;
type Key = IdentityKeyPair['privateKey'];
type RecipientKeys = Pick<IdentityKeyPair, 'privateKey' | 'publicKey'>;
const text = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
const version = text('HPKE-v1');
const kemSuite = new Uint8Array([0x4b, 0x45, 0x4d, 0x00, 0x20]);
const hpkeSuite = new Uint8Array([0x48, 0x50, 0x4b, 0x45, 0x00, 0x20, 0x00, 0x01, 0x00, 0x02]);

class HpkeFailure extends Error {
  readonly code: HpkeError;
  constructor(code: HpkeError) {
    super(code);
    this.code = code;
  }
}

function failed<T>(error: unknown): HpkeResult<T> {
  return { ok: false, error: error instanceof HpkeFailure ? error.code : 'unsupported-crypto' };
}

async function native<T>(operation: Promise<T>, errorCode: HpkeError): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    throw new HpkeFailure(error instanceof Error && error.name === 'NotSupportedError'
      ? 'unsupported-crypto' : errorCode);
  }
}

function bytes(value: unknown, error: HpkeError = 'invalid-input'): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new HpkeFailure(error);
  return value;
}

function copy(value: Uint8Array): Uint8Array<ArrayBuffer> {
  try {
    return new Uint8Array(value);
  } catch {
    throw new HpkeFailure('invalid-input');
  }
}

function fixedKey(value: unknown): Uint8Array<ArrayBuffer> {
  const input = bytes(value, 'invalid-key');
  if (input.byteLength !== 32) throw new HpkeFailure('invalid-key');
  return copy(input);
}

function limit(value: unknown): number {
  // Leave space for the GCM tag and fixed RFC labels in length arithmetic.
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0
    || value > Number.MAX_SAFE_INTEGER - 256) throw new HpkeFailure('invalid-limits');
  return value;
}

function readContext(value: unknown) {
  if (!value || typeof value !== 'object') throw new HpkeFailure('invalid-input');
  const fields = value as Record<string, unknown>;
  if (!fields.limits || typeof fields.limits !== 'object') throw new HpkeFailure('invalid-limits');
  const limits = fields.limits as Record<string, unknown>;
  const maxPlaintextBytes = limit(limits.maxPlaintextBytes);
  const maxContextBytes = limit(limits.maxContextBytes);
  const info = bytes(fields.info);
  const aad = bytes(fields.aad);
  if (info.byteLength > maxContextBytes || aad.byteLength > maxContextBytes - info.byteLength) {
    throw new HpkeFailure('limit-exceeded');
  }
  return { info: copy(info), aad: copy(aad), maxPlaintextBytes };
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

// One native HKDF call implements each adjacent RFC LabeledExtract/LabeledExpand pair.
async function labeledDerive(
  subtle: Subtle, suite: Uint8Array, salt: Uint8Array<ArrayBuffer>, extractLabel: string,
  ikm: Uint8Array, expandLabel: string, info: Uint8Array, length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const material = concat(version, suite, text(extractLabel), ikm);
  const key = await subtle.importKey('raw', material, 'HKDF', false, ['deriveBits']);
  const labeledInfo = concat(new Uint8Array([0, length]), version, suite, text(expandLabel), info);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: labeledInfo }, key, length * 8));
}

async function extractHash(subtle: Subtle, label: string, input: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  // RFC 5869 treats an empty salt as HashLen zero bytes.
  const salt = await subtle.importKey('raw', new Uint8Array(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', salt, concat(version, hpkeSuite, text(label), input)));
}

async function schedule(
  subtle: Subtle, privateKey: Key, peerPublic: Key, enc: Uint8Array,
  recipientPublic: Uint8Array, info: Uint8Array,
) {
  const dh = new Uint8Array(await native(subtle.deriveBits({ name: 'X25519', public: peerPublic }, privateKey, 256), 'invalid-key'));
  if (dh.reduce((combined, byte) => combined | byte, 0) === 0) throw new HpkeFailure('invalid-key');
  const sharedSecret = await labeledDerive(subtle, kemSuite, new Uint8Array(),
    'eae_prk', dh, 'shared_secret', concat(enc, recipientPublic), 32);
  const [pskIdHash, infoHash] = await Promise.all([
    extractHash(subtle, 'psk_id_hash', new Uint8Array()), extractHash(subtle, 'info_hash', info),
  ]);
  const keyScheduleContext = concat(new Uint8Array([0]), pskIdHash, infoHash);
  const [keyBytes, nonce] = await Promise.all([
    labeledDerive(subtle, hpkeSuite, sharedSecret, 'secret', new Uint8Array(), 'key', keyScheduleContext, 32),
    labeledDerive(subtle, hpkeSuite, sharedSecret, 'secret', new Uint8Array(), 'base_nonce', keyScheduleContext, 12),
  ]);
  const key = await subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { key, nonce };
}

export async function sealHpkeBase(
  recipientPublic: unknown, plaintext: unknown, context: HpkeContext,
): Promise<HpkeResult<HpkeCiphertext>> {
  try {
    const options = readContext(context);
    const recipient = fixedKey(recipientPublic);
    const input = bytes(plaintext);
    if (input.byteLength > options.maxPlaintextBytes) throw new HpkeFailure('limit-exceeded');
    const owned = copy(input);
    const subtle = globalThis.crypto.subtle;
    const publicKey = await native(subtle.importKey('raw', recipient, 'X25519', true, []), 'invalid-key');
    const ephemeral = await subtle.generateKey('X25519', false, ['deriveBits']);
    if (!('privateKey' in ephemeral)) throw new HpkeFailure('unsupported-crypto');
    const enc = new Uint8Array(await subtle.exportKey('raw', ephemeral.publicKey));
    const { key, nonce } = await schedule(subtle, ephemeral.privateKey, publicKey, enc, recipient, options.info);
    const ciphertext = new Uint8Array(await subtle.encrypt({
      name: 'AES-GCM', iv: nonce, additionalData: options.aad, tagLength: 128,
    }, key, owned));
    return { ok: true, value: { enc, ciphertext } };
  } catch (error) {
    return failed(error);
  }
}

export async function openHpkeBase(
  recipient: unknown, encapsulation: unknown, ciphertext: unknown, context: HpkeContext,
): Promise<HpkeResult<Uint8Array>> {
  try {
    const options = readContext(context);
    const enc = fixedKey(encapsulation);
    const input = bytes(ciphertext);
    if (input.byteLength < 16) throw new HpkeFailure('invalid-input');
    if (input.byteLength - 16 > options.maxPlaintextBytes) throw new HpkeFailure('limit-exceeded');
    const owned = copy(input);
    if (!recipient || typeof recipient !== 'object') throw new HpkeFailure('invalid-key');
    const keys = recipient as Partial<RecipientKeys>;
    const privateKey = keys.privateKey;
    const publicKey = keys.publicKey;
    if (privateKey?.algorithm.name !== 'X25519' || privateKey.type !== 'private'
      || !privateKey.usages.includes('deriveBits') || publicKey?.algorithm.name !== 'X25519'
      || publicKey.type !== 'public') throw new HpkeFailure('invalid-key');
    const subtle = globalThis.crypto.subtle;
    const recipientPublic = new Uint8Array(await native(subtle.exportKey('raw', publicKey), 'invalid-key'));
    if (recipientPublic.byteLength !== 32) throw new HpkeFailure('invalid-key');
    const peer = await native(subtle.importKey('raw', enc, 'X25519', true, []), 'invalid-key');
    const { key, nonce } = await schedule(subtle, privateKey, peer, enc, recipientPublic, options.info);
    const plaintext = await native(subtle.decrypt({
      name: 'AES-GCM', iv: nonce, additionalData: options.aad, tagLength: 128,
    }, key, owned), 'authentication-failed');
    return { ok: true, value: new Uint8Array(plaintext) };
  } catch (error) {
    return failed(error);
  }
}
