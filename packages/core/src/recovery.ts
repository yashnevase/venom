import { RECOVERY_WORDS } from './data/bip39-english.js';

export type RecoveryError = 'invalid-input' | 'invalid-entropy' | 'invalid-phrase'
  | 'unknown-word' | 'invalid-checksum' | 'limit-exceeded' | 'unsupported-crypto';
export type RecoveryResult<T> = { ok: true; value: T } | { ok: false; error: RecoveryError };
export interface RecoveryMaterial {
  entropy: Uint8Array;
  phrase: string;
  rootSeed: Uint8Array;
}
const wordIndices = new Map(RECOVERY_WORDS.map((word, index) => [word, index]));
const PHRASE_MAX_UNITS = 512;

class RecoveryFailure extends Error {
  constructor(readonly code: RecoveryError) { super(code); }
}
function failure(error: unknown): RecoveryResult<never> {
  return { ok: false, error: error instanceof RecoveryFailure ? error.code : 'unsupported-crypto' };
}
function requireValue<T>(result: RecoveryResult<T>): T {
  if (!result.ok) throw new RecoveryFailure(result.error);
  return result.value;
}
function entropyCopy(input: unknown): Uint8Array<ArrayBuffer> {
  if (!(input instanceof Uint8Array) || input.byteLength !== 32) {
    throw new RecoveryFailure('invalid-entropy');
  }
  return new Uint8Array(input);
}
async function checksum(entropy: Uint8Array<ArrayBuffer>): Promise<number> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', entropy));
  const first = digest[0];
  if (first === undefined) throw new RecoveryFailure('unsupported-crypto');
  return first;
}

/** Encode exactly 256 bits using the BIP-39 English entropy/checksum mapping. */
export async function entropyToRecoveryPhrase(input: unknown): Promise<RecoveryResult<string>> {
  try {
    const entropy = entropyCopy(input);
    let bits = 0n;
    for (const byte of entropy) bits = (bits << 8n) | BigInt(byte);
    bits = (bits << 8n) | BigInt(await checksum(entropy));
    const words: string[] = [];
    for (let index = 0; index < 24; index++) {
      const wordIndex = Number((bits >> BigInt((23 - index) * 11)) & 2047n);
      const word = RECOVERY_WORDS[wordIndex];
      if (word === undefined) throw new RecoveryFailure('invalid-phrase');
      words.push(word);
    }
    return { ok: true, value: words.join(' ') };
  } catch (error) { return failure(error); }
}

/** Normalize a bounded English phrase and verify its 8-bit checksum. */
export async function recoveryPhraseToEntropy(input: unknown): Promise<RecoveryResult<Uint8Array>> {
  try {
    if (typeof input !== 'string') throw new RecoveryFailure('invalid-input');
    if (input.length > PHRASE_MAX_UNITS) throw new RecoveryFailure('limit-exceeded');
    const normalized = input.normalize('NFKD').toLowerCase().trim().replace(/\s+/gu, ' ');
    if (normalized.length > PHRASE_MAX_UNITS) throw new RecoveryFailure('limit-exceeded');
    const words = normalized.split(' ');
    if (words.length !== 24) throw new RecoveryFailure('invalid-phrase');
    let bits = 0n;
    for (const word of words) {
      const index = wordIndices.get(word);
      if (index === undefined) throw new RecoveryFailure('unknown-word');
      bits = (bits << 11n) | BigInt(index);
    }
    const suppliedChecksum = Number(bits & 255n);
    bits >>= 8n;
    const entropy = new Uint8Array(32);
    for (let index = 31; index >= 0; index--) {
      entropy[index] = Number(bits & 255n);
      bits >>= 8n;
    }
    if (await checksum(entropy) !== suppliedChecksum) throw new RecoveryFailure('invalid-checksum');
    return { ok: true, value: entropy };
  } catch (error) { return failure(error); }
}

/** The owner-selected OpenMesh entropy-to-root mapping from docs/04 section 2. */
export async function deriveRootSeedFromEntropy(input: unknown): Promise<RecoveryResult<Uint8Array>> {
  try {
    const entropy = entropyCopy(input);
    const key = await globalThis.crypto.subtle.importKey('raw', entropy, 'HKDF', false, ['deriveBits']);
    entropy.fill(0);
    const root = await globalThis.crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256',
      salt: new TextEncoder().encode('openmesh-root-v1'),
      info: new TextEncoder().encode('ed25519-root') }, key, 256);
    return { ok: true, value: new Uint8Array(root) };
  } catch (error) { return failure(error); }
}

export async function recoverRootSeed(phrase: unknown): Promise<RecoveryResult<Uint8Array>> {
  try {
    const entropy = requireValue(await recoveryPhraseToEntropy(phrase));
    try {
      return await deriveRootSeedFromEntropy(entropy);
    } finally {
      entropy.fill(0);
    }
  } catch (error) { return failure(error); }
}

export async function createRecovery(): Promise<RecoveryResult<RecoveryMaterial>> {
  try {
    const entropy = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const phrase = requireValue(await entropyToRecoveryPhrase(entropy));
    const rootSeed = requireValue(await deriveRootSeedFromEntropy(entropy));
    return { ok: true, value: { entropy, phrase, rootSeed } };
  } catch (error) { return failure(error); }
}
