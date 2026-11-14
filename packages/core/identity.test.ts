import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  createIdentityKeys, issueDeviceCertificate, verifyDeviceCertificate,
  revokeDeviceCertificate, verifyCertificateRevocation,
} from './src/identity.js';
import { encodeCbor, decodeCbor } from './src/cbor.js';

const limits = { maxBytes: 1024, maxDepth: 4, maxItems: 32 };
const created = 1_700_000_000n;
const expiry = created + 3600n;
const bytes = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, 'hex'));
const seeds = () => ({
  root: bytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'),
  deviceSigning: bytes('4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb'),
  deviceEncryption: bytes('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a'),
});

async function identity() {
  const result = await createIdentityKeys(seeds());
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('Phase 1 identity acceptance', () => {
  it('VEC-IDENTITY matches independently signed key and certificate fixtures', async () => {
    const json: unknown = JSON.parse(await readFile(new URL('../test-vectors/identity.json', import.meta.url), 'utf8'));
    const vectors = json as { root_public_hex: string; device_signing_public_hex: string;
      device_encryption_public_hex: string; certificate_hex: string; revocation_hex: string };
    const keys = await identity();
    expect(keys.root.publicBytes).toEqual(bytes(vectors.root_public_hex));
    expect(keys.deviceSigning.publicBytes).toEqual(bytes(vectors.device_signing_public_hex));
    expect(keys.deviceEncryption.publicBytes).toEqual(bytes(vectors.device_encryption_public_hex));
    const issued = await issueDeviceCertificate(keys, { created, expiry, limits });
    expect(issued).toEqual({ ok: true, value: bytes(vectors.certificate_hex) });
    const checked = await verifyDeviceCertificate(bytes(vectors.certificate_hex), keys.root.publicBytes,
      { now: created + 1n, limits });
    expect(checked.ok).toBe(true);
    const revoked = await revokeDeviceCertificate(keys, bytes(vectors.certificate_hex), created + 10n, limits);
    expect(revoked).toEqual({ ok: true, value: bytes(vectors.revocation_hex) });
    expect((await verifyCertificateRevocation(bytes(vectors.revocation_hex), keys.root.publicBytes, limits)).ok).toBe(true);
  });

  it('IDENTITY-KEYS separates roles and returns non-extractable private keys', async () => {
    const keys = await identity();
    for (const pair of [keys.root, keys.deviceSigning, keys.deviceEncryption]) {
      expect(pair.privateKey.extractable).toBe(false);
      expect(pair.publicBytes).toHaveLength(32);
      await expect(crypto.subtle.exportKey('pkcs8', pair.privateKey)).rejects.toThrow();
    }
    expect(keys.root.publicBytes).not.toEqual(keys.deviceSigning.publicBytes);
    expect(keys.deviceEncryption.privateKey.algorithm.name).toBe('X25519');
    expect(keys.deviceSigning.privateKey.algorithm.name).toBe('Ed25519');
    const supplied = seeds();
    const pending = createIdentityKeys(supplied);
    supplied.root.fill(0);
    const restored = await pending;
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.value.root.publicBytes).toEqual(keys.root.publicBytes);
    const exported = keys.exportSeeds();
    exported.root.fill(0);
    expect(keys.exportSeeds().root).toEqual(seeds().root);
    const publicCopy = keys.root.publicBytes;
    publicCopy.fill(0);
    expect(keys.root.publicBytes).not.toEqual(publicCopy);
    const reused = seeds();
    reused.deviceSigning = new Uint8Array(reused.root);
    expect(await createIdentityKeys(reused)).toEqual({ ok: false, error: 'invalid-input' });
  });

  it('IDENTITY-TIME applies issuance and exclusive expiry boundaries', async () => {
    const keys = await identity();
    const issued = await issueDeviceCertificate(keys, { created, expiry, limits });
    if (!issued.ok) throw new Error(issued.error);
    expect(await verifyDeviceCertificate(issued.value, keys.root.publicBytes, { now: created - 1n, limits }))
      .toEqual({ ok: false, error: 'not-yet-valid' });
    expect((await verifyDeviceCertificate(issued.value, keys.root.publicBytes, { now: created, limits })).ok).toBe(true);
    expect(await verifyDeviceCertificate(issued.value, keys.root.publicBytes, { now: expiry, limits }))
      .toEqual({ ok: false, error: 'expired' });
    expect(await issueDeviceCertificate(keys, { created, expiry: created, limits }))
      .toEqual({ ok: false, error: 'invalid-input' });
  });

  it('IDENTITY-TRUST rejects changed certificates and an incorrect root', async () => {
    const keys = await identity();
    const issued = await issueDeviceCertificate(keys, { created, expiry, limits });
    if (!issued.ok) throw new Error(issued.error);
    const wrong = seeds();
    wrong.root.fill(8);
    const other = await createIdentityKeys(wrong);
    if (!other.ok) throw new Error(other.error);
    expect(await verifyDeviceCertificate(issued.value, other.value.root.publicBytes, { now: created, limits }))
      .toEqual({ ok: false, error: 'invalid-signature' });
    for (let bit = 0; bit < issued.value.byteLength * 8; bit += 1) {
      const corrupted = new Uint8Array(issued.value);
      const view = new DataView(corrupted.buffer);
      const index = Math.floor(bit / 8);
      view.setUint8(index, view.getUint8(index) ^ (1 << (bit % 8)));
      expect((await verifyDeviceCertificate(corrupted, keys.root.publicBytes, { now: created, limits })).ok).toBe(false);
    }
  });

  it('IDENTITY-REVOKE validates root-signed revocation and its effective time', async () => {
    const keys = await identity();
    const issued = await issueDeviceCertificate(keys, { created, expiry, limits });
    if (!issued.ok) throw new Error(issued.error);
    const revoked = await revokeDeviceCertificate(keys, issued.value, created + 10n, limits);
    if (!revoked.ok) throw new Error(revoked.error);
    expect((await verifyDeviceCertificate(issued.value, keys.root.publicBytes,
      { now: created + 9n, limits, revocation: revoked.value })).ok).toBe(true);
    expect(await verifyDeviceCertificate(issued.value, keys.root.publicBytes,
      { now: created + 10n, limits, revocation: revoked.value }))
      .toEqual({ ok: false, error: 'revoked' });
    const changed = new Uint8Array(revoked.value);
    changed[changed.length - 1] = (changed.at(-1) ?? 0) ^ 1;
    expect((await verifyCertificateRevocation(changed, keys.root.publicBytes, limits)).ok).toBe(false);
  });

  it('IDENTITY-VERSION ignores unknown versions and rejects oversized input', async () => {
    const keys = await identity();
    const issued = await issueDeviceCertificate(keys, { created, expiry, limits });
    if (!issued.ok) throw new Error(issued.error);
    const decoded = decodeCbor(issued.value, limits);
    if (!decoded.ok || !(decoded.value instanceof Map)) throw new Error('Expected map');
    decoded.value.set('v', 2);
    const unknown = encodeCbor(decoded.value, limits);
    if (!unknown.ok) throw new Error(unknown.error);
    expect(await verifyDeviceCertificate(unknown.value, keys.root.publicBytes, { now: created, limits }))
      .toEqual({ ok: false, error: 'unsupported-version' });
    expect(await verifyDeviceCertificate(new Uint8Array(1025), keys.root.publicBytes, { now: created, limits }))
      .toEqual({ ok: false, error: 'limit-exceeded' });
  });

  it('IDENTITY-RESTORE supports optional expiry, fresh keys and copied seed exports', async () => {
    const fresh = await createIdentityKeys();
    if (!fresh.ok) throw new Error(fresh.error);
    const restored = await createIdentityKeys(fresh.value.exportSeeds());
    if (!restored.ok) throw new Error(restored.error);
    expect(restored.value.root.publicBytes).toEqual(fresh.value.root.publicBytes);
    expect(restored.value.deviceEncryption.publicBytes).toEqual(fresh.value.deviceEncryption.publicBytes);
    const issued = await issueDeviceCertificate(fresh.value, { created: 0n, limits });
    if (!issued.ok) throw new Error(issued.error);
    expect((await verifyDeviceCertificate(issued.value, fresh.value.root.publicBytes,
      { now: (1n << 64n) - 1n, limits })).ok).toBe(true);
    for (const invalid of [null, 0, 'seed', {}, { ...seeds(), root: new Uint8Array(31) }]) {
      expect(await createIdentityKeys(invalid)).toEqual({ ok: false, error: 'invalid-input' });
    }
  });

  it('IDENTITY-SNAPSHOT keeps the verified certificate, proof, root and budgets consistent', async () => {
    const keys = await identity();
    const issued = await issueDeviceCertificate(keys, { created, expiry, limits });
    if (!issued.ok) throw new Error(issued.error);
    const revoked = await revokeDeviceCertificate(keys, issued.value, created, limits);
    if (!revoked.ok) throw new Error(revoked.error);
    const root = keys.root.publicBytes;
    const wire = new Uint8Array(issued.value);
    const proof = new Uint8Array(revoked.value);
    const mutableLimits = { ...limits };
    const pending = verifyDeviceCertificate(wire, root, { now: created, limits: mutableLimits, revocation: proof });
    root.fill(0);
    wire.fill(0);
    proof.fill(0);
    mutableLimits.maxBytes = 1;
    expect(await pending).toEqual({ ok: false, error: 'revoked' });
  });

  it('FUZZ-IDENTITY rejects 2000 seeded hostile inputs without exceptions', async () => {
    const keys = await identity();
    let state = 0x49440001;
    for (let trial = 0; trial < 2000; trial += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const input = new Uint8Array(state % 1100);
      for (let index = 0; index < input.length; index += 1) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        input[index] = state >>> 24;
      }
      expect((await verifyDeviceCertificate(input, keys.root.publicBytes, { now: created, limits })).ok).toBe(false);
      expect((await verifyCertificateRevocation(input, keys.root.publicBytes, limits)).ok).toBe(false);
    }
  });

  it('IDENTITY-CRYPTO reports an unavailable native provider', async () => {
    vi.stubGlobal('crypto', undefined);
    try {
      expect(await createIdentityKeys(seeds())).toEqual({ ok: false, error: 'unsupported-crypto' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
