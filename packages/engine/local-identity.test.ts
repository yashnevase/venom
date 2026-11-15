import { expect, it } from 'vitest';
import { createLocalIdentity, unlockLocalIdentity } from './src/local-identity.js';
import { createCacheBackup, restoreCacheBackup } from './src/backup.js';
import { decodeCbor, encodeCbor, openBackup, recoveryPhraseToEntropy, sealBackup } from '@openmesh/core';
const now = 1794700800;
const limits = { maxBytes: 16384, maxDepth: 8, maxItems: 128 };
function value<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
it('P2-IDENTITY creates a phrase-bound stored identity and restores its exact device keys', async () => {
  const created = await createLocalIdentity(now);
  expect(created.phrase.split(' ')).toHaveLength(24);
  const unlocked = await unlockLocalIdentity(created.record, created.phrase, now + 60);
  expect(unlocked.keys.exportSeeds()).toEqual(created.sender.keys.exportSeeds());
  expect(unlocked.contact).toEqual(created.sender.contact);
  const entropy = value(await recoveryPhraseToEntropy(created.phrase));
  const snapshot = value(await openBackup(created.record, entropy, limits));
  expect(snapshot.length).toBeLessThan(1024);
});
it('P2-IDENTITY-FAIL rejects wrong phrases, damaged records and future certificates', async () => {
  const created = await createLocalIdentity(now);
  const other = await createLocalIdentity(now);
  await expect(unlockLocalIdentity(created.record, other.phrase, now)).rejects.toThrow();
  await expect(unlockLocalIdentity(created.record, 'wrong phrase', now)).rejects.toThrow();
  await expect(unlockLocalIdentity(created.record, created.phrase, now - 1)).rejects.toThrow('not-yet-valid');
  const damaged = created.record.slice(); damaged[damaged.length - 1] = (damaged.at(-1) ?? 0) ^ 1;
  await expect(unlockLocalIdentity(damaged, created.phrase, now)).rejects.toThrow();
});
it('P2-IDENTITY-BINDING rejects authenticated payloads whose seeds do not match the certificate', async () => {
  const created = await createLocalIdentity(now);
  const entropy = value(await recoveryPhraseToEntropy(created.phrase));
  const decoded = value(decodeCbor(value(await openBackup(created.record, entropy, limits)), limits));
  if (!Array.isArray(decoded)) throw new Error('Expected tuple');
  for (const field of [1, 2]) {
    const changed = decoded.slice();
    changed[field] = new Uint8Array(32).fill(5);
    const record = value(await sealBackup(value(encodeCbor(changed, limits)), entropy, now, limits));
    await expect(unlockLocalIdentity(record, created.phrase, now)).rejects.toThrow('Device key mismatch');
  }
});
it('P2-IDENTITY-SCHEMA rejects unsupported and malformed identity payloads before activation', async () => {
  const created = await createLocalIdentity(now);
  const entropy = value(await recoveryPhraseToEntropy(created.phrase));
  for (const data of [[2, new Uint8Array(32), new Uint8Array(32), new Uint8Array(), null],
    [1], [1, new Uint8Array(31), new Uint8Array(32), created.sender.contact.certificate, null]]) {
    const record = value(await sealBackup(value(encodeCbor(data, limits)), entropy, now, limits));
    await expect(unlockLocalIdentity(record, created.phrase, now)).rejects.toThrow();
  }
});
it('P2-IDENTITY-BACKUP validates real identity records through the cache backup boundary', async () => {
  const created = await createLocalIdentity(now);
  const entropy = value(await recoveryPhraseToEntropy(created.phrase));
  const records = [{ store: 'identity', key: 'current', value: created.record }];
  const policy = { ...limits, maxBytes: 32768, maxRecords: 4, maxRecordBytes: 16384 };
  const validate = async (entries: readonly { store: string; key: string; value: Uint8Array }[]) => {
    if (entries.length !== 1 || entries[0]?.store !== 'identity' || entries[0].key !== 'current') throw new Error('Unexpected identity inventory');
    await unlockLocalIdentity(entries[0].value, created.phrase, now);
  };
  const backup = await createCacheBackup({ snapshot: () => Promise.resolve(records) }, entropy, now, policy, validate);
  let activated = false;
  await restoreCacheBackup(backup, entropy, policy, validate, (entries, state) => {
    expect(entries).toEqual(records); expect(state.requiresContactResynchronization).toBe(true); activated = true;
  });
  expect(activated).toBe(true);
});
it('P2-IDENTITY-OWNERSHIP captures stored bytes before phrase verification awaits', async () => {
  const created = await createLocalIdentity(now);
  const wire = created.record.slice();
  const pending = unlockLocalIdentity(wire, created.phrase, now);
  wire.fill(0);
  expect((await pending).contact).toEqual(created.sender.contact);
  await expect(unlockLocalIdentity(new Uint8Array(16385), created.phrase, now)).rejects.toThrow('Invalid identity record');
});
it('P2-IDENTITY-REVOKED rejects a root-authenticated revocation in the stored payload', async () => {
  const { revokeDeviceCertificate } = await import('@openmesh/core');
  const created = await createLocalIdentity(now);
  const entropy = value(await recoveryPhraseToEntropy(created.phrase));
  const decoded = value(decodeCbor(value(await openBackup(created.record, entropy, limits)), limits));
  if (!Array.isArray(decoded)) throw new Error('Expected tuple');
  decoded[4] = value(await revokeDeviceCertificate(created.sender.keys, created.sender.contact.certificate, now, limits));
  const record = value(await sealBackup(value(encodeCbor(decoded, limits)), entropy, now, limits));
  await expect(unlockLocalIdentity(record, created.phrase, now)).rejects.toThrow('revoked');
});
it('P2-IDENTITY-CERTIFICATE rejects a different root and an expired certificate', async () => {
  const { issueDeviceCertificate } = await import('@openmesh/core');
  const created = await createLocalIdentity(now);
  const other = await createLocalIdentity(now);
  const entropy = value(await recoveryPhraseToEntropy(created.phrase));
  const decoded = value(decodeCbor(value(await openBackup(created.record, entropy, limits)), limits));
  if (!Array.isArray(decoded)) throw new Error('Expected tuple');
  const expired = value(await issueDeviceCertificate(created.sender.keys, { created: now - 60, expiry: now, limits }));
  for (const certificate of [other.sender.contact.certificate, expired]) {
    const changed = decoded.slice(); changed[3] = certificate;
    const record = value(await sealBackup(value(encodeCbor(changed, limits)), entropy, now, limits));
    await expect(unlockLocalIdentity(record, created.phrase, now)).rejects.toThrow();
  }
  const seeds = created.sender.keys.exportSeeds();
  expect(seeds.deviceSigning).not.toEqual(seeds.deviceEncryption);
  expect(seeds.root).not.toEqual(seeds.deviceSigning);
  expect(created.sender.contact.root).not.toEqual(other.sender.contact.root);
});
