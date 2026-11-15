import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createIdentityKeys } from './src/identity.js';
import { entropyToRecoveryPhrase, recoveryPhraseToEntropy, deriveRootSeedFromEntropy,
  recoverRootSeed, createRecovery } from './src/recovery.js';

function value<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
const hex = (text: string) => new Uint8Array(Buffer.from(text, 'hex'));
let published: { entropy_hex: string; phrase: string }[];
beforeAll(async () => {
  const data = JSON.parse(await readFile(new URL('../test-vectors/bip39-published.json', import.meta.url), 'utf8')) as {
    vectors: { entropy_hex: string; phrase: string }[];
  };
  published = data.vectors;
});

describe('Phase 1 recovery acceptance', () => {
  it('matches every published 256-bit English entropy/phrase pair in both directions', async () => {
    expect(published.length).toBeGreaterThan(0);
    for (const vector of published) {
      expect(value(await entropyToRecoveryPhrase(hex(vector.entropy_hex)))).toBe(vector.phrase);
      expect(value(await recoveryPhraseToEntropy(vector.phrase))).toEqual(hex(vector.entropy_hex));
    }
  });

  it('normalizes case, whitespace and NFKD forms before validating exactly24 words', async () => {
    const phrase = 'abandon '.repeat(23) + 'art';
    const fullWidth = Array.from(phrase, letter => letter === ' ' ? '\u3000'
      : String.fromCharCode(letter.charCodeAt(0) + 0xfee0)).join('');
    const expected = new Uint8Array(32);
    expect(value(await recoveryPhraseToEntropy('\t' + phrase.toUpperCase().replaceAll(' ', '\n') + '\n'))).toEqual(expected);
    expect(value(await recoveryPhraseToEntropy(fullWidth))).toEqual(expected);
  });

  it('rejects unknown words, bad checksum, wrong entropy length and oversized input with typed results', async () => {
    expect((await recoveryPhraseToEntropy('abandon '.repeat(24))).ok).toBe(false);
    expect((await recoveryPhraseToEntropy('abandon '.repeat(23) + 'notaword')).ok).toBe(false);
    expect((await recoveryPhraseToEntropy('abandon '.repeat(11) + 'about')).ok).toBe(false);
    expect((await recoveryPhraseToEntropy(' '.repeat(513))).ok).toBe(false);
    for (const input of [null, {}, new Uint8Array(31), new Uint8Array(33)]) {
      expect((await entropyToRecoveryPhrase(input)).ok).toBe(false);
      expect((await deriveRootSeedFromEntropy(input)).ok).toBe(false);
    }
    expect((await recoveryPhraseToEntropy(null)).ok).toBe(false);
  });

  it('creates independent local entropy, recovers the same root and retains separate device seeds', async () => {
    const first = value(await createRecovery());
    const second = value(await createRecovery());
    expect(first.phrase.split(' ')).toHaveLength(24);
    expect(first.entropy).toHaveLength(32);
    expect(first.entropy).not.toEqual(second.entropy);
    expect(value(await recoverRootSeed(first.phrase))).toEqual(first.rootSeed);
    const keys = value(await createIdentityKeys({ root: first.rootSeed,
      deviceSigning: new Uint8Array(32).fill(90), deviceEncryption: new Uint8Array(32).fill(91) }));
    const restored = value(await createIdentityKeys({ root: value(await recoverRootSeed(first.phrase)),
      deviceSigning: new Uint8Array(32).fill(92), deviceEncryption: new Uint8Array(32).fill(93) }));
    expect(keys.root.publicBytes).toEqual(restored.root.publicBytes);
    expect(keys.deviceSigning.publicBytes).not.toEqual(restored.deviceSigning.publicBytes);
    first.entropy.fill(0);
    expect(value(await recoverRootSeed(first.phrase))).toEqual(first.rootSeed);
  });

  it('snapshots entropy before native asynchronous operations', async () => {
    const entropy = new Uint8Array(32);
    const phrasePending = entropyToRecoveryPhrase(entropy);
    entropy.fill(255);
    expect(value(await phrasePending)).toBe('abandon '.repeat(23) + 'art');
    const rootInput = new Uint8Array(32);
    const expected = value(await deriveRootSeedFromEntropy(rootInput));
    const pending = deriveRootSeedFromEntropy(rootInput);
    rootInput.fill(255);
    expect(value(await pending)).toEqual(expected);
  });

  it('returns typed failure when native digest, HKDF or random generation is unavailable', async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('unavailable'));
    try { expect((await entropyToRecoveryPhrase(new Uint8Array(32))).ok).toBe(false); }
    finally { digest.mockRestore(); }
    const derive = vi.spyOn(globalThis.crypto.subtle, 'deriveBits').mockRejectedValue(new Error('unavailable'));
    try { expect((await deriveRootSeedFromEntropy(new Uint8Array(32))).ok).toBe(false); }
    finally { derive.mockRestore(); }
    const random = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(() => { throw new Error('unavailable'); });
    try { expect((await createRecovery()).ok).toBe(false); }
    finally { random.mockRestore(); }
  });
});

it('matches independently generated OpenMesh root seeds and Ed25519 root public keys', async () => {
  const fixture = JSON.parse(await readFile(new URL('../test-vectors/recovery.json', import.meta.url), 'utf8')) as {
    vectors: { entropy_hex: string; phrase: string; root_seed_hex: string; root_public_hex: string }[];
  };
  expect(fixture.vectors).toHaveLength(72);
  for (const vector of fixture.vectors) {
    const root = value(await deriveRootSeedFromEntropy(hex(vector.entropy_hex)));
    expect(root).toEqual(hex(vector.root_seed_hex));
    expect(value(await recoverRootSeed(vector.phrase))).toEqual(root);
    const keys = value(await createIdentityKeys({ root,
      deviceSigning: new Uint8Array(32).fill(100), deviceEncryption: new Uint8Array(32).fill(101) }));
    expect(keys.root.publicBytes).toEqual(hex(vector.root_public_hex));
  }
});

it('bounds normalization expansion and reports exact parsing failures', async () => {
  expect(await recoveryPhraseToEntropy('\ufdfa'.repeat(40))).toEqual({ ok: false, error: 'limit-exceeded' });
  expect(await recoveryPhraseToEntropy('abandon '.repeat(24))).toEqual({ ok: false, error: 'invalid-checksum' });
  expect(await recoveryPhraseToEntropy('abandon '.repeat(23) + 'notaword')).toEqual({ ok: false, error: 'unknown-word' });
  expect(await recoveryPhraseToEntropy('abandon '.repeat(11) + 'about')).toEqual({ ok: false, error: 'invalid-phrase' });
  expect(await recoveryPhraseToEntropy(null)).toEqual({ ok: false, error: 'invalid-input' });
  expect(await entropyToRecoveryPhrase(new Uint8Array(31))).toEqual({ ok: false, error: 'invalid-entropy' });
  const phrase = 'abandon '.repeat(23) + 'art';
  expect(value(await recoveryPhraseToEntropy(phrase.padEnd(512, ' ')))).toEqual(new Uint8Array(32));
  expect(await recoveryPhraseToEntropy(phrase.padEnd(513, ' '))).toEqual({ ok: false, error: 'limit-exceeded' });
});

it('returns the native import failure and independently generates new device key material', async () => {
  const importKey = vi.spyOn(globalThis.crypto.subtle, 'importKey').mockRejectedValue(new Error('unavailable'));
  try { expect(await deriveRootSeedFromEntropy(new Uint8Array(32))).toEqual({ ok: false, error: 'unsupported-crypto' }); }
  finally { importKey.mockRestore(); }
  const phrase = 'abandon '.repeat(23) + 'art';
  const root = value(await recoverRootSeed(phrase));
  const restored = async () => value(await createIdentityKeys({ root,
    deviceSigning: globalThis.crypto.getRandomValues(new Uint8Array(32)),
    deviceEncryption: globalThis.crypto.getRandomValues(new Uint8Array(32)) }));
  const one = await restored();
  const two = await restored();
  expect(one.root.publicBytes).toEqual(two.root.publicBytes);
  expect(one.deviceSigning.publicBytes).not.toEqual(two.deviceSigning.publicBytes);
  expect(one.deviceEncryption.publicBytes).not.toEqual(two.deviceEncryption.publicBytes);
  expect(one.exportSeeds().deviceSigning).not.toEqual(one.exportSeeds().deviceEncryption);
});

it('ships the pinned word data and MIT notice in the distribution', async () => {
  const { RECOVERY_WORDS } = await import('./src/data/bip39-english.js');
  const raw = await readFile(new URL('./src/data/bip39-english.txt', import.meta.url), 'utf8');
  expect(RECOVERY_WORDS.join('\n') + '\n').toBe(raw);
  expect(new Set(RECOVERY_WORDS).size).toBe(2048);
  expect([...RECOVERY_WORDS].sort()).toEqual(RECOVERY_WORDS);
  expect(Object.isFrozen(RECOVERY_WORDS)).toBe(true);
  const license = await readFile(new URL('./src/data/bip39-LICENSE.txt', import.meta.url), 'utf8');
  expect(await readFile(new URL('./dist/data/bip39-LICENSE.txt', import.meta.url), 'utf8')).toBe(license);
  expect(await readFile(new URL('./dist/data/bip39-english.txt', import.meta.url), 'utf8')).toBe(raw);
});

it('exposes recovery through the package source entry', async () => {
  const api = await import('./src/index.js');
  expect(api.createRecovery).toBe(createRecovery);
  expect(api.recoverRootSeed).toBe(recoverRootSeed);
  expect(api.recoveryPhraseToEntropy).toBe(recoveryPhraseToEntropy);
});
