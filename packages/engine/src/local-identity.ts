import { createRecovery, createIdentityKeys, deriveRootSeedFromEntropy,
  recoveryPhraseToEntropy, issueDeviceCertificate, verifyDeviceCertificate,
  encodeCbor, decodeCbor, sealBackup, openBackup } from '@openmesh/core';
import type { BoxSender } from '@openmesh/core';

const IDENTITY_LIMITS = Object.freeze({ maxBytes: 16384, maxDepth: 8, maxItems: 128 });
const CERTIFICATE_LIMITS = Object.freeze({ maxBytes: 1024, maxDepth: 8, maxItems: 64 });
export interface CreatedLocalIdentity { phrase: string; sender: BoxSender; record: Uint8Array }
function value<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function bytes(input: unknown, length: number): Uint8Array {
  if (!(input instanceof Uint8Array) || input.length !== length) throw new Error('Invalid identity seed');
  return new Uint8Array(input);
}
function certificateBytes(input: unknown): Uint8Array {
  if (!(input instanceof Uint8Array) || input.length === 0 || input.length > CERTIFICATE_LIMITS.maxBytes) throw new Error('Invalid identity certificate');
  return new Uint8Array(input);
}
/** Caller persists only record, presents the phrase once and retains sender only while unlocked. */
export async function createLocalIdentity(now: number | bigint): Promise<CreatedLocalIdentity> {
  const recovery = value(await createRecovery());
  const keys = value(await createIdentityKeys({ root: recovery.rootSeed,
    deviceSigning: globalThis.crypto.getRandomValues(new Uint8Array(32)),
    deviceEncryption: globalThis.crypto.getRandomValues(new Uint8Array(32)) }));
  const certificate = value(await issueDeviceCertificate(keys, { created: now, limits: CERTIFICATE_LIMITS }));
  const seeds = keys.exportSeeds();
  const snapshot = value(encodeCbor([1, seeds.deviceSigning, seeds.deviceEncryption, certificate, null], IDENTITY_LIMITS));
  const record = value(await sealBackup(snapshot, recovery.entropy, now, IDENTITY_LIMITS));
  return { phrase: recovery.phrase, record, sender: { keys, contact: { root: keys.root.publicBytes, certificate } } };
}
/** Authentication and key/certificate binding finish before an active sender is returned. */
export async function unlockLocalIdentity(record: unknown, phrase: unknown, now: number | bigint): Promise<BoxSender> {
  if (!(record instanceof Uint8Array) || record.length === 0 || record.length > IDENTITY_LIMITS.maxBytes) throw new Error('Invalid identity record');
  const wire = new Uint8Array(record);
  const entropy = value(await recoveryPhraseToEntropy(phrase));
  const snapshot = value(await openBackup(wire, entropy, IDENTITY_LIMITS));
  const data = value(decodeCbor(snapshot, IDENTITY_LIMITS));
  if (!Array.isArray(data) || data.length !== 5 || data[0] !== 1) throw new Error('Invalid identity record');
  const signing = bytes(data[1], 32);
  const agreement = bytes(data[2], 32);
  const certificate = certificateBytes(data[3]);
  const revocation = data[4] === null ? undefined : certificateBytes(data[4]);
  const rootSeed = value(await deriveRootSeedFromEntropy(entropy));
  const keys = value(await createIdentityKeys({ root: rootSeed, deviceSigning: signing, deviceEncryption: agreement }));
  const checked = value(await verifyDeviceCertificate(certificate, keys.root.publicBytes,
    { now, limits: CERTIFICATE_LIMITS, ...(revocation === undefined ? {} : { revocation }) }));
  const signingPublic = keys.deviceSigning.publicBytes;
  const agreementPublic = keys.deviceEncryption.publicBytes;
  if (!checked.device_pub_sign.every((byte, index) => byte === signingPublic[index])
    || !checked.device_pub_dh.every((byte, index) => byte === agreementPublic[index])) {
    throw new Error('Device key mismatch');
  }
  return { keys, contact: { root: keys.root.publicBytes, certificate,
    ...(revocation === undefined ? {} : { revocation }) } };
}
