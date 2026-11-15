export const CACHE_STORES = ['identity', 'contacts', 'boxes', 'outbox', 'logs', 'files',
  'chunks', 'shards_out', 'shards_held', 'relay_stats', 'carrier_stats', 'quotas'] as const;
export type CacheStore = typeof CACHE_STORES[number];
export interface CacheLimits { maxRecordBytes: number; maxOperations: number }
export interface CacheWrite { store: CacheStore; key: string; value?: Uint8Array }
export interface CacheRecord { store: CacheStore; key: string; value: Uint8Array }
export interface SnapshotLimits { maxRecords: number; maxBytes: number }
export interface WorkingCache {
  snapshot: (stores: readonly CacheStore[], limits: SnapshotLimits) => Promise<CacheRecord[]>;
  get: (store: CacheStore, key: string) => Promise<Uint8Array | undefined>;
  writeBatch: (writes: readonly CacheWrite[]) => Promise<void>;
  replaceAll: (records: readonly CacheRecord[]) => Promise<void>;
  close: () => void;
}
function validStore(store: string): asserts store is CacheStore {
  if (!(CACHE_STORES as readonly string[]).includes(store)) throw new Error('Unknown cache store');
}
function validKey(key: string) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 512) throw new Error('Invalid cache key');
}
/** Byte-record working set. Engine validates schemas and protects secret fields before writes. */
export function openCache(name: string, limits: CacheLimits): Promise<WorkingCache> {
  if (typeof name !== 'string' || !name || name.length > 128) return Promise.reject(new Error('Invalid cache name'));
  const bounds = { ...limits };
  if (![bounds.maxRecordBytes, bounds.maxOperations].every(value => Number.isSafeInteger(value) && value > 0)) return Promise.reject(new Error('Invalid cache limits'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    let abandoned = false;
    request.onblocked = () => { abandoned = true; reject(new Error('Cache upgrade blocked')); };
    request.onerror = () => { reject(request.error ?? new Error('Cache open failed')); };
    request.onupgradeneeded = () => {
      for (const store of CACHE_STORES) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
    };
    request.onsuccess = () => {
      const database = request.result;
      if (abandoned) { database.close(); return; }
      database.onversionchange = () => { database.close(); };
      if (database.objectStoreNames.length !== CACHE_STORES.length
        || CACHE_STORES.some(store => !database.objectStoreNames.contains(store))) {
        database.close(); reject(new Error('Incompatible cache schema')); return;
      }
      const inspection = database.transaction([...CACHE_STORES], 'readonly');
      for (const name of CACHE_STORES) {
        const store = inspection.objectStore(name);
        if (store.keyPath !== null || store.autoIncrement || store.indexNames.length !== 0) {
          database.close(); reject(new Error('Incompatible cache schema')); return;
        }
      }
      resolve({
        close: () => { database.close(); },
        async replaceAll(records) {
          if (!Array.isArray(records) || records.length > bounds.maxOperations) throw new Error('Cache batch limit exceeded');
          const keys = new Set<string>();
          const snapshots = records.map((record: CacheRecord) => {
            validStore(record.store); validKey(record.key);
            if (!(record.value instanceof Uint8Array) || record.value.length > bounds.maxRecordBytes) throw new Error('Cache record limit exceeded');
            const identity = JSON.stringify([record.store, record.key]);
            if (keys.has(identity)) throw new Error('Duplicate cache record');
            keys.add(identity);
            return { store: record.store, key: record.key, value: new Uint8Array(record.value) };
          });
          await new Promise<void>((done, fail) => {
            const transaction = database.transaction([...CACHE_STORES], 'readwrite');
            transaction.oncomplete = () => { done(); };
            transaction.onabort = () => { fail(transaction.error ?? new Error('Cache replacement aborted')); };
            transaction.onerror = () => { /* abort settles the operation */ };
            try {
              for (const name of CACHE_STORES) transaction.objectStore(name).clear();
              for (const record of snapshots) transaction.objectStore(record.store).put(record.value, record.key);
            } catch (error) { transaction.abort(); fail(error instanceof Error ? error : new Error('Cache replacement failed')); }
          });
        },
        get(store, key) {
          validStore(store); validKey(key);
          return new Promise((done, fail) => {
            const transaction = database.transaction(store, 'readonly');
            const read = transaction.objectStore(store).get(key);
            let value: Uint8Array | undefined;
            read.onsuccess = () => {
              const raw: unknown = read.result;
              if (raw === undefined) return;
              if (!(raw instanceof Uint8Array) || raw.length > bounds.maxRecordBytes) { transaction.abort(); return; }
              value = new Uint8Array(raw);
            };
            transaction.oncomplete = () => { done(value); };
            transaction.onabort = () => { fail(transaction.error ?? new Error('Cache read aborted')); };
            transaction.onerror = () => { /* onabort settles the operation */ };
          });
        },
        async snapshot(stores, policy) {
          const maximum = { ...policy };
          if (![maximum.maxRecords, maximum.maxBytes].every(value => Number.isSafeInteger(value) && value > 0)
            || !Array.isArray(stores) || stores.length > CACHE_STORES.length) throw new Error('Invalid snapshot limits');
          const selected: CacheStore[] = [...new Set(stores as CacheStore[])].sort();
          selected.forEach(validStore);
          if (selected.length === 0) return [];
          return await new Promise<CacheRecord[]>((done, fail) => {
            const transaction = database.transaction(selected, 'readonly');
            const records: CacheRecord[] = [];
            let total = 0;
            let error: Error | undefined;
            transaction.oncomplete = () => { done(records.sort((a, b) =>
              a.store < b.store ? -1 : a.store > b.store ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0)); };
            transaction.onabort = () => { fail(error ?? transaction.error ?? new Error('Snapshot aborted')); };
            transaction.onerror = () => { /* abort settles */ };
            for (const name of selected) {
              const cursorRequest = transaction.objectStore(name).openCursor();
              cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result;
                if (!cursor || error) return;
                try {
                  const key: unknown = cursor.key;
                  const value: unknown = cursor.value;
                  if (typeof key !== 'string') throw new Error('Invalid stored key');
                  validKey(key);
                  if (!(value instanceof Uint8Array) || value.length > bounds.maxRecordBytes
                    || value.length > maximum.maxBytes - total || records.length >= maximum.maxRecords) {
                    throw new Error('Snapshot limit exceeded');
                  }
                  total += value.length;
                  records.push({ store: name, key, value: new Uint8Array(value) });
                  cursor.continue();
                } catch (reason) {
                  error = reason instanceof Error ? reason : new Error('Snapshot failed');
                  transaction.abort();
                }
              };
            }
          });
        },
        async writeBatch(writes) {
          if (!Array.isArray(writes) || writes.length > bounds.maxOperations) throw new Error('Cache batch limit exceeded');
          const snapshots = writes.map((write: CacheWrite) => {
            validStore(write.store); validKey(write.key);
            if (write.value !== undefined && (!(write.value instanceof Uint8Array) || write.value.length > bounds.maxRecordBytes)) throw new Error('Cache record limit exceeded');
            return { store: write.store, key: write.key, value: write.value === undefined ? undefined : new Uint8Array(write.value) };
          });
          if (snapshots.length === 0) return;
          await new Promise<void>((done, fail) => {
            const transaction = database.transaction([...new Set(snapshots.map(write => write.store))], 'readwrite');
            transaction.oncomplete = () => { done(); };
            transaction.onabort = () => { fail(transaction.error ?? new Error('Cache write aborted')); };
            transaction.onerror = () => { /* onabort settles the operation */ };
            try {
              for (const write of snapshots) {
                const store = transaction.objectStore(write.store);
                if (write.value === undefined) store.delete(write.key);
                else store.put(write.value, write.key);
              }
            } catch (error) { transaction.abort(); fail(error instanceof Error ? error : new Error('Cache write failed')); }
          });
        },
      });
    };
  });
}

export interface StorageProvider {
  estimate: () => Promise<{ usage?: number; quota?: number }>;
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}
export type StorageStatus = { available: false } | { available: true; usage: number;
  quota: number; remaining: number; nearCapacity: boolean; persistent: boolean | undefined };

/** Advisory browser estimates. Actual writes can still fail or compete for space. */
export async function inspectStorage(provider?: StorageProvider): Promise<StorageStatus> {
  try {
    const storage = provider ?? navigator.storage;
    const estimate = await storage.estimate();
    const usage = estimate.usage;
    const quota = estimate.quota;
    if (typeof usage !== 'number' || !Number.isFinite(usage) || usage < 0
      || typeof quota !== 'number' || !Number.isFinite(quota) || quota <= 0) return { available: false };
    let persistent: boolean | undefined;
    try { persistent = await storage.persisted?.(); } catch { persistent = undefined; }
    return { available: true, usage, quota, remaining: Math.max(0, quota - usage),
      nearCapacity: usage / quota >= 0.8, persistent };
  } catch { return { available: false }; }
}

/** UI calls this explicitly after explaining browser persistence to the user. */
export async function requestPersistence(provider?: StorageProvider): Promise<boolean> {
  try { return await (provider ?? navigator.storage).persist?.() ?? false; }
  catch { return false; }
}
export { createImportStaging } from './opfs.js';
export type { StagingLimits } from './opfs.js';
