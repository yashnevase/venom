import { decodeCbor, encodeCbor } from './cbor.js';
import type { CborError, CborLimits, CborValue } from './cbor.js';
import { identifyChunk } from './chunk.js';

export type IdentityError = CborError | 'invalid-input' | 'invalid-certificate'
  | 'invalid-revocation' | 'invalid-root' | 'invalid-signature' | 'not-yet-valid'
  | 'expired' | 'revoked' | 'unsupported-version' | 'unsupported-crypto';
export type IdentityResult<T> = { ok: true; value: T } | { ok: false; error: IdentityError };
export interface IdentitySeeds {
  root: Uint8Array;
  deviceSigning: Uint8Array;
  deviceEncryption: Uint8Array;
}
export interface IdentityKeyPair {
  readonly privateKey: Awaited<ReturnType<typeof globalThis.crypto.subtle.importKey>>;
  readonly publicKey: Awaited<ReturnType<typeof globalThis.crypto.subtle.importKey>>;
  readonly publicBytes: Uint8Array;
}
export interface IdentityKeys {
  readonly root: IdentityKeyPair;
  readonly deviceSigning: IdentityKeyPair;
  readonly deviceEncryption: IdentityKeyPair;
  exportSeeds(): IdentitySeeds;
}
export interface DeviceCertificate {
  v: 1;
  device_pub_sign: Uint8Array;
  device_pub_dh: Uint8Array;
  created: bigint;
  expiry?: bigint;
  sig: Uint8Array;
}
export interface CertificateRevocation {
  v: 1;
  certificate_hash: Uint8Array;
  revoked: bigint;
  sig: Uint8Array;
}
export interface CertificateOptions {
  created: number | bigint;
  expiry?: number | bigint;
  limits: CborLimits;
}
export interface CertificatePolicy {
  now: number | bigint;
  limits: CborLimits;
  revocation?: Uint8Array;
}

class IdentityFailure extends Error {
  readonly code: IdentityError;
  constructor(code: IdentityError) {
    super(code);
    this.code = code;
  }
}

function failure<T>(error: unknown): IdentityResult<T> {
  return { ok: false, error: error instanceof IdentityFailure ? error.code : 'unsupported-crypto' };
}

function fixedBytes(value: unknown, length: number, error: IdentityError): Uint8Array<ArrayBuffer> {
  if (!(value instanceof Uint8Array) || value.byteLength !== length) throw new IdentityFailure(error);
  return new Uint8Array(value);
}

function equalBytes(first: Uint8Array, second: Uint8Array): boolean {
  return first.byteLength === second.byteLength && first.every((byte, index) => byte === second[index]);
}

function epoch(value: unknown): bigint {
  const integer = typeof value === 'number' && Number.isSafeInteger(value) ? BigInt(value) : value;
  if (typeof integer !== 'bigint' || integer < 0n || integer >= (1n << 64n)) {
    throw new IdentityFailure('invalid-input');
  }
  return integer;
}

function encoded(value: unknown, limits: CborLimits): Uint8Array {
  const result = encodeCbor(value, limits);
  if (!result.ok) throw new IdentityFailure(result.error);
  return result.value;
}

async function importSeed(seed: Uint8Array, algorithm: 'Ed25519' | 'X25519'): Promise<IdentityKeyPair> {
  // RFC 8410 PrivateKeyInfo with a nested 32-byte CurvePrivateKey OCTET STRING.
  const der = new Uint8Array(48);
  der.set([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, algorithm === 'Ed25519' ? 0x70 : 0x6e, 0x04, 0x22, 0x04, 0x20]);
  der.set(seed, 16);
  const privateUsages: ('sign' | 'deriveBits')[] = algorithm === 'Ed25519' ? ['sign'] : ['deriveBits'];
  const publicUsages: 'verify'[] = algorithm === 'Ed25519' ? ['verify'] : [];
  const temporary = await globalThis.crypto.subtle.importKey('pkcs8', der, algorithm, true, privateUsages);
  const jwk = await globalThis.crypto.subtle.exportKey('jwk', temporary);
  if (typeof jwk.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(jwk.x)) {
    throw new IdentityFailure('unsupported-crypto');
  }
  const publicBytes = Uint8Array.from(atob(jwk.x.replace(/-/g, '+').replace(/_/g, '/') + '='),
    (character) => character.charCodeAt(0));
  const publicKey = await globalThis.crypto.subtle.importKey('raw', publicBytes, algorithm, true, publicUsages);
  const privateKey = await globalThis.crypto.subtle.importKey('pkcs8', der, algorithm, false, privateUsages);
  return Object.freeze({ privateKey, publicKey,
    get publicBytes() { return new Uint8Array(publicBytes); },
  });
}

export async function createIdentityKeys(supplied?: unknown): Promise<IdentityResult<IdentityKeys>> {
  try {
    const source: unknown = supplied === undefined ? {
      root: globalThis.crypto.getRandomValues(new Uint8Array(32)),
      deviceSigning: globalThis.crypto.getRandomValues(new Uint8Array(32)),
      deviceEncryption: globalThis.crypto.getRandomValues(new Uint8Array(32)),
    } : supplied;
    if (source === null || typeof source !== 'object') throw new IdentityFailure('invalid-input');
    const fields = source as Record<string, unknown>;
    const seeds = {
      root: fixedBytes(fields.root, 32, 'invalid-input'),
      deviceSigning: fixedBytes(fields.deviceSigning, 32, 'invalid-input'),
      deviceEncryption: fixedBytes(fields.deviceEncryption, 32, 'invalid-input'),
    };
    if (equalBytes(seeds.root, seeds.deviceSigning) || equalBytes(seeds.root, seeds.deviceEncryption)
      || equalBytes(seeds.deviceSigning, seeds.deviceEncryption)) throw new IdentityFailure('invalid-input');
    const [root, deviceSigning, deviceEncryption] = await Promise.all([
      importSeed(seeds.root, 'Ed25519'), importSeed(seeds.deviceSigning, 'Ed25519'),
      importSeed(seeds.deviceEncryption, 'X25519'),
    ]);
    const value: IdentityKeys = Object.freeze({ root, deviceSigning, deviceEncryption,
      exportSeeds: () => ({ root: new Uint8Array(seeds.root),
        deviceSigning: new Uint8Array(seeds.deviceSigning),
        deviceEncryption: new Uint8Array(seeds.deviceEncryption) }),
    });
    return { ok: true, value };
  } catch (error) {
    return failure(error);
  }
}

interface SignedRecord {
  map: Map<CborValue, CborValue>;
  unsigned: Map<CborValue, CborValue>;
  sig: Uint8Array<ArrayBuffer>;
  wire: Uint8Array;
}

function readRecord(
  input: unknown, required: string[], optional: string[], limits: CborLimits,
  error: 'invalid-certificate' | 'invalid-revocation',
): SignedRecord {
  const parsed = decodeCbor(input, limits);
  if (!parsed.ok) throw new IdentityFailure(parsed.error);
  if (!(parsed.value instanceof Map)) throw new IdentityFailure(error);
  const map = parsed.value;
  if (!map.has('v')) throw new IdentityFailure(error);
  if (epoch(map.get('v')) !== 1n) throw new IdentityFailure('unsupported-version');
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !map.has(key))
    || [...map.keys()].some((key) => typeof key !== 'string' || !allowed.has(key))) {
    throw new IdentityFailure(error);
  }
  const sig = fixedBytes(map.get('sig'), 64, error);
  const unsigned = new Map(map);
  unsigned.delete('sig');
  return { map, unsigned, sig, wire: encoded(map, limits) };
}

function readCertificate(input: unknown, limits: CborLimits): SignedRecord & { certificate: DeviceCertificate } {
  const record = readRecord(input, ['v', 'device_pub_sign', 'device_pub_dh', 'created', 'sig'],
    ['expiry'], limits, 'invalid-certificate');
  const certificate: DeviceCertificate = {
    v: 1,
    device_pub_sign: fixedBytes(record.map.get('device_pub_sign'), 32, 'invalid-certificate'),
    device_pub_dh: fixedBytes(record.map.get('device_pub_dh'), 32, 'invalid-certificate'),
    created: epoch(record.map.get('created')), sig: record.sig,
  };
  if (record.map.has('expiry')) {
    certificate.expiry = epoch(record.map.get('expiry'));
    if (certificate.expiry <= certificate.created) throw new IdentityFailure('invalid-certificate');
  }
  return { ...record, certificate };
}

async function verifyRoot(
  record: SignedRecord, rootPublic: Uint8Array<ArrayBuffer>, limits: CborLimits,
): Promise<void> {
  const key = await globalThis.crypto.subtle.importKey('raw', rootPublic, 'Ed25519', true, ['verify']);
  if (!await globalThis.crypto.subtle.verify('Ed25519', key, record.sig, encoded(record.unsigned, limits))) {
    throw new IdentityFailure('invalid-signature');
  }
}

async function certificateHash(wire: Uint8Array, limits: CborLimits): Promise<Uint8Array> {
  const result = await identifyChunk(wire, limits.maxBytes);
  if (!result.ok) throw new IdentityFailure(result.error === 'unsupported-crypto' ? result.error : 'invalid-certificate');
  return result.value.chunkId;
}

export async function issueDeviceCertificate(
  keys: IdentityKeys, options: CertificateOptions,
): Promise<IdentityResult<Uint8Array>> {
  try {
    const limits = { ...options.limits };
    const created = epoch(options.created);
    const expiry = options.expiry === undefined ? undefined : epoch(options.expiry);
    if (expiry !== undefined && expiry <= created) throw new IdentityFailure('invalid-input');
    const rootPrivate = keys.root.privateKey;
    const signingPublic = keys.deviceSigning.publicKey;
    const encryptionPublic = keys.deviceEncryption.publicKey;
    if (rootPrivate.algorithm.name !== 'Ed25519' || signingPublic.algorithm.name !== 'Ed25519'
      || encryptionPublic.algorithm.name !== 'X25519') throw new IdentityFailure('invalid-input');
    const signingBytes = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', signingPublic));
    const encryptionBytes = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', encryptionPublic));
    const map = new Map<CborValue, CborValue>([
      ['v', 1], ['device_pub_sign', signingBytes], ['device_pub_dh', encryptionBytes], ['created', created],
    ]);
    if (expiry !== undefined) map.set('expiry', expiry);
    const signature = await globalThis.crypto.subtle.sign('Ed25519', rootPrivate, encoded(map, limits));
    map.set('sig', new Uint8Array(signature));
    return { ok: true, value: encoded(map, limits) };
  } catch (error) {
    return failure(error);
  }
}

export async function verifyCertificateRevocation(
  input: unknown, expectedRoot: unknown, limits: CborLimits,
): Promise<IdentityResult<CertificateRevocation>> {
  try {
    const root = fixedBytes(expectedRoot, 32, 'invalid-root');
    const bounds = { ...limits };
    const record = readRecord(input, ['v', 'certificate_hash', 'revoked', 'sig'], [], bounds, 'invalid-revocation');
    const value: CertificateRevocation = { v: 1,
      certificate_hash: fixedBytes(record.map.get('certificate_hash'), 32, 'invalid-revocation'),
      revoked: epoch(record.map.get('revoked')), sig: record.sig };
    await verifyRoot(record, root, bounds);
    return { ok: true, value };
  } catch (error) {
    return failure(error);
  }
}

export async function verifyDeviceCertificate(
  input: unknown, expectedRoot: unknown, policy: CertificatePolicy,
): Promise<IdentityResult<DeviceCertificate>> {
  try {
    const root = fixedBytes(expectedRoot, 32, 'invalid-root');
    const now = epoch(policy.now);
    const limits = { ...policy.limits };
    const record = readCertificate(input, limits);
    // Snapshot a supplied proof before the first asynchronous operation.
    let proof: Uint8Array | undefined;
    if (policy.revocation !== undefined) {
      const decoded = decodeCbor(policy.revocation, limits);
      if (!decoded.ok) throw new IdentityFailure(decoded.error);
      proof = encoded(decoded.value, limits);
    }
    await verifyRoot(record, root, limits);
    if (now < record.certificate.created) throw new IdentityFailure('not-yet-valid');
    if (record.certificate.expiry !== undefined && now >= record.certificate.expiry) {
      throw new IdentityFailure('expired');
    }
    if (proof) {
      const revocation = await verifyCertificateRevocation(proof, root, limits);
      if (!revocation.ok) throw new IdentityFailure(revocation.error);
      if (revocation.value.revoked <= now
        && equalBytes(revocation.value.certificate_hash, await certificateHash(record.wire, limits))) {
        throw new IdentityFailure('revoked');
      }
    }
    return { ok: true, value: record.certificate };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeDeviceCertificate(
  keys: IdentityKeys, input: unknown, revokedAt: number | bigint, limits: CborLimits,
): Promise<IdentityResult<Uint8Array>> {
  try {
    const bounds = { ...limits };
    const revoked = epoch(revokedAt);
    const rootPrivate = keys.root.privateKey;
    const rootPublic = keys.root.publicKey;
    const record = readCertificate(input, bounds);
    const root = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', rootPublic));
    await verifyRoot(record, root, bounds);
    const hash = await certificateHash(record.wire, bounds);
    const map = new Map<CborValue, CborValue>([['v', 1], ['certificate_hash', hash], ['revoked', revoked]]);
    const signature = await globalThis.crypto.subtle.sign('Ed25519', rootPrivate, encoded(map, bounds));
    map.set('sig', new Uint8Array(signature));
    return { ok: true, value: encoded(map, bounds) };
  } catch (error) {
    return failure(error);
  }
}
