import { describe, expect, it } from 'vitest';
import { encodeCbor } from '@openmesh/core';
import { createCacheBackup, restoreCacheBackup } from './src/backup.js';
import type { BackupRecord } from './src/backup.js';

const limits = { maxBytes: 32768, maxDepth: 8, maxItems: 256, maxRecords: 8, maxRecordBytes: 4096 };
const entropy = new Uint8Array(32).fill(7);
const records: [BackupRecord, BackupRecord] = [{ store: 'identity', key: 'current', value: new Uint8Array([1, 2]) },
  { store: 'contacts', key: 'alice', value: new Uint8Array([3]) }];

describe('Phase 2 cache backup boundary', () => {
  it('P2-BACKUP snapshots, authenticates, validates and replaces with a resync requirement', async () => {
    const events: string[] = [];
    const wire = await createCacheBackup({ snapshot() { events.push('snapshot'); return Promise.resolve(records); } },
      entropy, 60, limits, entries => { expect(entries).toHaveLength(2); events.push('validate-export'); });
    let restored: unknown;
    await restoreCacheBackup(wire, entropy, limits, entries => {
      expect(entries.map(record => record.store)).toEqual(['contacts', 'identity']); events.push('validate-import');
    }, (entries, policy) => { restored = { entries, policy }; events.push('replace'); });
    expect(events).toEqual(['snapshot', 'validate-export', 'validate-import', 'replace']);
    expect(restored).toEqual({ entries: [records[1], records[0]], policy: { requiresContactResynchronization: true } });
  });

  it('P2-BACKUP-FAIL leaves replacement untouched after authentication or schema failure', async () => {
    const wire = await createCacheBackup({ snapshot() { return Promise.resolve(records); } }, entropy, 60, limits, () => {});
    let calls = 0;
    const replace = () => { calls++; };
    const changed = new Uint8Array(wire); changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1;
    for (const input of [changed, wire.slice(0, -1), new Uint8Array([255])]) {
      await expect(restoreCacheBackup(input, entropy, limits, () => {}, replace)).rejects.toThrow();
    }
    await expect(restoreCacheBackup(wire, new Uint8Array(32), limits, () => {}, replace)).rejects.toThrow();
    await expect(restoreCacheBackup(wire, entropy, limits, () => { throw new Error('Invalid identity'); }, replace)).rejects.toThrow('Invalid identity');
    expect(calls).toBe(0);
  });

  it('P2-BACKUP-RECORDS rejects unknown stores, duplicate keys, invalid values and budgets before validation', async () => {
    let validations = 0;
    for (const entries of [
      [{ store: 'unknown', key: 'x', value: new Uint8Array() }],
      [records[0], records[0]],
      [{ store: 'identity', key: '', value: new Uint8Array() }],
      [{ store: 'identity', key: 'x', value: new Uint8Array(4097) }],
      Array.from({ length: 9 }, (_, index) => ({ store: 'boxes', key: String(index), value: new Uint8Array() })),
    ]) {
      await expect(createCacheBackup({ snapshot() { return Promise.resolve(entries); } }, entropy, 60, limits,
        () => { validations++; })).rejects.toThrow();
    }
    expect(validations).toBe(0);
  });

  it('P2-BACKUP-COMMIT reports failed replacement and snapshots caller limits before awaits', async () => {
    const policy = { ...limits };
    const pending = createCacheBackup({ snapshot() { policy.maxBytes = 1; return Promise.resolve(records); } }, entropy, 60, policy, () => {});
    const wire = await pending;
    await expect(restoreCacheBackup(wire, entropy, limits, () => {}, () => {
      throw new Error('Commit failed');
    })).rejects.toThrow('Commit failed');
  });

  it('P2-BACKUP-FRAMING validates authenticated snapshot framing before invoking application schemas', async () => {
    const { sealBackup } = await import('@openmesh/core');
    const encoded = encodeCbor([1, [['identity', 'same', new Uint8Array()], ['identity', 'same', new Uint8Array()]]], limits);
    if (!encoded.ok) throw new Error(encoded.error);
    const sealed = await sealBackup(encoded.value, entropy, 60, limits);
    if (!sealed.ok) throw new Error(sealed.error);
    let validations = 0;
    await expect(restoreCacheBackup(sealed.value, entropy, limits, () => { validations++; }, () => {})).rejects.toThrow();
    expect(validations).toBe(0);
  });
  it('P2-BACKUP-OWNERSHIP isolates recovery input and disposable validator buffers', async () => {
    const recovery = new Uint8Array(entropy);
    const wire = await createCacheBackup({ snapshot() {
      recovery.fill(0); return Promise.resolve(records);
    } }, recovery, 60, limits, entries => { entries[0]?.value.fill(9); });
    let restored: readonly BackupRecord[] = [];
    await restoreCacheBackup(wire, entropy, limits,
      entries => { entries[0]?.value.fill(8); },
      entries => { restored = entries; });
    expect(restored).toEqual([records[1], records[0]]);
  });

  it('P2-BACKUP-SCHEMA rejects authenticated unsupported versions, tuple shapes and ordering', async () => {
    const { sealBackup } = await import('@openmesh/core');
    const row = ['identity', 'current', new Uint8Array([1])];
    const cases = [[2, []], [1, [row], 0], [1, [['identity', 'x']]],
      [1, [['identity', 'x', 1]]], [1, [row, ['contacts', 'alice', new Uint8Array()]]]];
    for (const data of cases) {
      const encoded = encodeCbor(data, limits);
      if (!encoded.ok) throw new Error(encoded.error);
      const sealed = await sealBackup(encoded.value, entropy, 60, limits);
      if (!sealed.ok) throw new Error(sealed.error);
      let replaced = false;
      await expect(restoreCacheBackup(sealed.value, entropy, limits, () => {}, () => {
        replaced = true;
      })).rejects.toThrow();
      expect(replaced).toBe(false);
    }
  });

});
