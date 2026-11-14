import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createIdentityKeys } from './src/identity.js';
import { sealHpkeBase, openHpkeBase } from './src/hpke.js';
import type { HpkeContext } from './src/hpke.js';

const bytes = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, 'hex'));
const limits = { maxPlaintextBytes: 5 * 1024 * 1024, maxContextBytes: 1024 };
const context = (): HpkeContext => ({ info: bytes('6f70656e6d657368'), aad: new Uint8Array(), limits: { ...limits } });

async function recipient(seed?: Uint8Array) {
  const identity = await createIdentityKeys(seed ? {
    root: new Uint8Array(32).fill(1), deviceSigning: new Uint8Array(32).fill(2), deviceEncryption: seed,
  } : undefined);
  if (!identity.ok) throw new Error(identity.error);
  return identity.value.deviceEncryption;
}

describe('Phase 1 RFC 9180 HPKE Base acceptance', () => {
  it('VEC-HPKE reproduces the published AES-256-GCM Base ciphertext', async () => {
    const json: unknown = JSON.parse(await readFile(new URL('../test-vectors/hpke.json', import.meta.url), 'utf8'));
    const document = json as { vectors: { skRm: string; pkRm: string; skEm: string; enc: string; info: string;
      encryption: { pt: string; aad: string; ct: string } }[] };
    for (const vector of document.vectors) {
      const target = await recipient(bytes(vector.skRm));
      const ephemeral = await recipient(bytes(vector.skEm));
      expect(target.publicBytes).toEqual(bytes(vector.pkRm));
      const generate = vi.spyOn(crypto.subtle, 'generateKey').mockResolvedValue({
        privateKey: ephemeral.privateKey, publicKey: ephemeral.publicKey,
      });
      const options = { info: bytes(vector.info), aad: bytes(vector.encryption.aad), limits };
      try {
        const sealed = await sealHpkeBase(target.publicBytes, bytes(vector.encryption.pt), options);
        expect(sealed).toEqual({ ok: true, value: { enc: bytes(vector.enc), ciphertext: bytes(vector.encryption.ct) } });
        expect(generate).toHaveBeenCalledExactlyOnceWith('X25519', false, ['deriveBits']);
        expect(await openHpkeBase(target, bytes(vector.enc), bytes(vector.encryption.ct), options))
          .toEqual({ ok: true, value: bytes(vector.encryption.pt) });
      } finally {
        generate.mockRestore();
      }
    }
  });

  it('HPKE-ROUNDTRIP handles empty through 5 MiB input with fresh encapsulation', async () => {
    const target = await recipient();
    for (const size of [0, 1, 32, 16384, 5 * 1024 * 1024]) {
      const input = Uint8Array.from({ length: size }, (_, index) => index % 251);
      const sealed = await sealHpkeBase(target.publicBytes, input, context());
      if (!sealed.ok) throw new Error(sealed.error);
      expect(sealed.value.enc).toHaveLength(32);
      expect(sealed.value.ciphertext).toHaveLength(size + 16);
      expect(await openHpkeBase(target, sealed.value.enc, sealed.value.ciphertext, context()))
        .toEqual({ ok: true, value: input });
    }
    const first = await sealHpkeBase(target.publicBytes, new Uint8Array(32), context());
    const second = await sealHpkeBase(target.publicBytes, new Uint8Array(32), context());
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.value.enc).not.toEqual(second.value.enc);
  });

  it('HPKE-AUTH rejects wrong keys, changed info, changed AAD and every ciphertext bit', async () => {
    const target = await recipient();
    const wrong = await recipient();
    const options = context();
    options.aad = bytes('0001');
    const sealed = await sealHpkeBase(target.publicBytes, new Uint8Array(32).fill(42), options);
    if (!sealed.ok) throw new Error(sealed.error);
    expect(await openHpkeBase(wrong, sealed.value.enc, sealed.value.ciphertext, options))
      .toEqual({ ok: false, error: 'authentication-failed' });
    for (const changed of [{ ...options, info: bytes('00') }, { ...options, aad: bytes('01') }]) {
      expect(await openHpkeBase(target, sealed.value.enc, sealed.value.ciphertext, changed))
        .toEqual({ ok: false, error: 'authentication-failed' });
    }
    for (let bit = 0; bit < sealed.value.ciphertext.length * 8; bit += 1) {
      const corrupted = new Uint8Array(sealed.value.ciphertext);
      const index = Math.floor(bit / 8);
      corrupted[index] = (corrupted[index] ?? 0) ^ (1 << (bit % 8));
      expect(await openHpkeBase(target, sealed.value.enc, corrupted, options))
        .toEqual({ ok: false, error: 'authentication-failed' });
    }
    for (let bit = 0; bit < sealed.value.enc.length * 8; bit += 1) {
      const changedEnc = new Uint8Array(sealed.value.enc);
      const index = Math.floor(bit / 8);
      changedEnc[index] = (changedEnc[index] ?? 0) ^ (1 << (bit % 8));
      expect((await openHpkeBase(target, changedEnc, sealed.value.ciphertext, options)).ok).toBe(false);
    }
    expect((await openHpkeBase(target, sealed.value.enc, sealed.value.ciphertext.slice(1), options)).ok).toBe(false);
  });

  it('HPKE-BOUNDS validates byte lengths and budgets before key generation', async () => {
    const target = await recipient();
    const generate = vi.spyOn(crypto.subtle, 'generateKey');
    try {
      expect(await sealHpkeBase(target.publicBytes, new Uint8Array(33), {
        ...context(), limits: { maxPlaintextBytes: 32, maxContextBytes: 1024 },
      })).toEqual({ ok: false, error: 'limit-exceeded' });
      expect(await sealHpkeBase(target.publicBytes, new Uint8Array(), {
        ...context(), limits: { maxPlaintextBytes: 0, maxContextBytes: 0 },
      })).toEqual({ ok: false, error: 'limit-exceeded' });
      expect(await sealHpkeBase(new Uint8Array(31), new Uint8Array(), context()))
        .toEqual({ ok: false, error: 'invalid-key' });
      expect(await sealHpkeBase(target.publicBytes, 'bytes', context()))
        .toEqual({ ok: false, error: 'invalid-input' });
      const detached = new Uint8Array(1);
      structuredClone(detached.buffer, { transfer: [detached.buffer] });
      expect(await sealHpkeBase(target.publicBytes, detached, context()))
        .toEqual({ ok: false, error: 'invalid-input' });
      expect(await sealHpkeBase(target.publicBytes, new Uint8Array(), {
        ...context(), limits: { maxPlaintextBytes: -1, maxContextBytes: 1024 },
      })).toEqual({ ok: false, error: 'invalid-limits' });
      expect(generate).not.toHaveBeenCalled();
      expect(await openHpkeBase(target, new Uint8Array(32), new Uint8Array(15), context()))
        .toEqual({ ok: false, error: 'invalid-input' });
      expect(await openHpkeBase(null, new Uint8Array(32), new Uint8Array(16), context()))
        .toEqual({ ok: false, error: 'invalid-key' });
      expect(await openHpkeBase(target, new Uint8Array(32), new Uint8Array(49), {
        ...context(), limits: { maxPlaintextBytes: 32, maxContextBytes: 1024 },
      })).toEqual({ ok: false, error: 'limit-exceeded' });
    } finally {
      generate.mockRestore();
    }
  });

  it('HPKE-LOW-ORDER rejects all-zero X25519 agreement inputs', async () => {
    const target = await recipient();
    for (const value of [0, 1]) {
      const invalid = new Uint8Array(32);
      invalid[0] = value;
      expect(await sealHpkeBase(invalid, new Uint8Array(), context()))
        .toEqual({ ok: false, error: 'invalid-key' });
      expect(await openHpkeBase(target, invalid, new Uint8Array(16), context()))
        .toEqual({ ok: false, error: 'invalid-key' });
    }
    const derive = vi.spyOn(crypto.subtle, 'deriveBits').mockResolvedValue(new Uint8Array(32).buffer);
    try {
      expect(await sealHpkeBase(target.publicBytes, new Uint8Array(), context()))
        .toEqual({ ok: false, error: 'invalid-key' });
      expect(derive).toHaveBeenCalledTimes(1);
    } finally {
      derive.mockRestore();
    }
  });

  it('HPKE-SNAPSHOT isolates both operations from caller mutation', async () => {
    const target = await recipient();
    const publicKey = target.publicBytes;
    const plaintext = new Uint8Array(32).fill(42);
    const options = context();
    options.aad = bytes('000102');
    const pending = sealHpkeBase(publicKey, plaintext, options);
    publicKey.fill(0);
    plaintext.fill(0);
    options.info.fill(0);
    options.aad.fill(0);
    options.limits.maxPlaintextBytes = 0;
    const sealed = await pending;
    if (!sealed.ok) throw new Error(sealed.error);
    const next = context();
    next.aad = bytes('000102');
    const opened = openHpkeBase(target, sealed.value.enc, sealed.value.ciphertext, next);
    sealed.value.enc.fill(0);
    sealed.value.ciphertext.fill(0);
    next.info.fill(0);
    next.aad.fill(0);
    next.limits.maxPlaintextBytes = 0;
    expect(await opened).toEqual({ ok: true, value: new Uint8Array(32).fill(42) });
  });

  it('HPKE-CRYPTO reports missing or unsupported native crypto', async () => {
    const target = await recipient();
    vi.stubGlobal('crypto', undefined);
    try {
      expect(await sealHpkeBase(target.publicBytes, new Uint8Array(), context()))
        .toEqual({ ok: false, error: 'unsupported-crypto' });
      expect(await openHpkeBase(target, new Uint8Array(32), new Uint8Array(16), context()))
        .toEqual({ ok: false, error: 'unsupported-crypto' });
    } finally {
      vi.unstubAllGlobals();
    }
    const generate = vi.spyOn(crypto.subtle, 'generateKey').mockRejectedValue(new DOMException('X25519', 'NotSupportedError'));
    try {
      expect(await sealHpkeBase(target.publicBytes, new Uint8Array(), context()))
        .toEqual({ ok: false, error: 'unsupported-crypto' });
    } finally {
      generate.mockRestore();
    }
  });

  it('FUZZ-HPKE returns typed failures for 2000 seeded hostile encapsulations and ciphertexts', async () => {
    const target = await recipient();
    let state = 0x48500001;
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };
    for (let trial = 0; trial < 2000; trial += 1) {
      const enc = Uint8Array.from({ length: 28 + next() % 9 }, () => next() >>> 24);
      const ciphertext = Uint8Array.from({ length: next() % 85 }, () => next() >>> 24);
      const result = await openHpkeBase(target, enc, ciphertext, {
        info: new Uint8Array(), aad: new Uint8Array(),
        limits: { maxPlaintextBytes: 64, maxContextBytes: 64 },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(['invalid-key', 'invalid-input', 'limit-exceeded', 'authentication-failed']).toContain(result.error);
    }
  });
});
