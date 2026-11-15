import { decodeCbor, encodeCbor, openBackup, sealBackup } from '@openmesh/core';
import type { CborLimits, CborValue } from '@openmesh/core';

// docs/11 storage classes. This wire list is fixed for snapshot version 1.
const STORES = ['identity', 'contacts', 'boxes', 'outbox', 'logs', 'files', 'chunks',
  'shards_out', 'shards_held', 'relay_stats', 'carrier_stats', 'quotas'] as const;
export interface BackupRecord { store: string; key: string; value: Uint8Array }
export interface BackupLimits extends CborLimits { maxRecords: number; maxRecordBytes: number }
export interface BackupSnapshotSource {
  snapshot: (stores: readonly (typeof STORES[number])[], limits: { maxRecords: number; maxBytes: number }) => Promise<BackupRecord[]>;
}
export type ValidateBackupRecords = (records: readonly BackupRecord[]) => Promise<void> | void;
export type ReplaceBackupRecords = (records: readonly BackupRecord[], policy: {
  requiresContactResynchronization: true;
}) => Promise<void> | void;

function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid or over-budget backup snapshot');
}
function bounds(input: BackupLimits): BackupLimits {
  const result = { ...input };
  requireValid([result.maxRecords, result.maxRecordBytes].every(value => Number.isSafeInteger(value) && value > 0));
  const checked = encodeCbor(null, result);
  if (!checked.ok) throw new Error(checked.error);
  return result;
}
function copyRecords(input: unknown, limits: BackupLimits): BackupRecord[] {
  requireValid(Array.isArray(input) && input.length <= limits.maxRecords);
  const seen = new Set<string>();
  let total = 0;
  return input.map((entry: unknown) => {
    requireValid(entry !== null && typeof entry === 'object');
    const record = entry as Record<string, unknown>;
    requireValid(Object.keys(record).length === 3);
    const { store, key, value } = record;
    requireValid(typeof store === 'string' && (STORES as readonly string[]).includes(store));
    requireValid(typeof key === 'string' && key.length > 0 && key.length <= 512);
    requireValid(value instanceof Uint8Array && value.length <= limits.maxRecordBytes && value.length <= limits.maxBytes - total);
    total += value.length;
    const identity = JSON.stringify([store, key]);
    requireValid(!seen.has(identity)); seen.add(identity);
    return { store, key, value: new Uint8Array(value) };
  }).sort((a, b) => a.store < b.store ? -1 : a.store > b.store ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}
function encodeRecords(records: readonly BackupRecord[], limits: BackupLimits): Uint8Array {
  const data: CborValue = [1, records.map(record => [record.store, record.key, record.value])];
  const encoded = encodeCbor(data, limits);
  if (!encoded.ok) throw new Error(encoded.error);
  return encoded.value;
}
function decodeRecords(bytes: Uint8Array, limits: BackupLimits): BackupRecord[] {
  const decoded = decodeCbor(bytes, limits);
  if (!decoded.ok) throw new Error(decoded.error);
  const data = decoded.value;
  requireValid(Array.isArray(data) && data.length === 2 && data[0] === 1);
  const entries = data[1];
  requireValid(Array.isArray(entries) && entries.length <= limits.maxRecords);
  const records = entries.map(entry => {
    requireValid(Array.isArray(entry) && entry.length === 3);
    return { store: entry[0], key: entry[1], value: entry[2] };
  });
  const normalized = copyRecords(records, limits);
  // The snapshot itself has one record order, independent of cursor scheduling.
  requireValid(normalized.every((record, index) => record.store === records.at(index)?.store && record.key === records.at(index)?.key));
  return normalized;
}
/** Schema validator must authenticate identity/contact/outbox semantics and reject incomplete inventories. */
export async function createCacheBackup(source: BackupSnapshotSource, entropy: unknown, created: number | bigint,
  limits: BackupLimits, validate: ValidateBackupRecords): Promise<Uint8Array> {
  const policy = bounds(limits);
  requireValid(entropy instanceof Uint8Array && entropy.length === 32);
  const recovery = new Uint8Array(entropy);
  const records = copyRecords(await source.snapshot([...STORES], { maxRecords: policy.maxRecords, maxBytes: policy.maxBytes }), policy);
  // Validators receive disposable copies and cannot change the signed snapshot.
  await validate(copyRecords(records, policy));
  const result = await sealBackup(encodeRecords(records, policy), recovery, created, policy);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
/** Replacement adapter atomically installs all records and the mandatory resynchronization state. */
export async function restoreCacheBackup(wire: unknown, entropy: unknown, limits: BackupLimits,
  validate: ValidateBackupRecords, replace: ReplaceBackupRecords): Promise<void> {
  const policy = bounds(limits);
  const result = await openBackup(wire, entropy, policy);
  if (!result.ok) throw new Error(result.error);
  const records = decodeRecords(result.value, policy);
  await validate(copyRecords(records, policy));
  await replace(records, { requiresContactResynchronization: true });
}
