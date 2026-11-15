import { expect, test } from '@playwright/test';

test('P2-STORE commits metadata atomically and reopens the local working set', async ({ page }) => {
  await page.goto('http://127.0.0.1:8321/');
  const result = await page.evaluate(async () => {
    const url: string = '/dist/store/index.js';
    const api = await import(url) as typeof import('../packages/store/dist/index.js');
    const name = 'openmesh-test-' + crypto.randomUUID();
    const cache = await api.openCache(name, { maxRecordBytes: 1024, maxOperations: 16 });
    await cache.writeBatch([{ store: 'boxes', key: 'one', value: new Uint8Array([1, 2]) },
      { store: 'outbox', key: 'one', value: new Uint8Array([3]) }]);
    const value = await cache.get('boxes', 'one');
    cache.close();
    const reopened = await api.openCache(name, { maxRecordBytes: 1024, maxOperations: 16 });
    const outbox = await reopened.get('outbox', 'one');
    let rejected = false;
    try { await reopened.writeBatch([{ store: 'boxes', key: 'two', value: new Uint8Array(2048) }]); }
    catch { rejected = true; }
    const missing = await reopened.get('boxes', 'two');
    reopened.close();
    const browser = globalThis as unknown as { indexedDB: { deleteDatabase: (name: string) => unknown } };
    browser.indexedDB.deleteDatabase(name);
    return { value: Array.from(value ?? []), outbox: Array.from(outbox ?? []), rejected, missing: missing === undefined };
  });
  expect(result).toEqual({ value: [1, 2], outbox: [3], rejected: true, missing: true });
});

test('P2-STORE-BATCH rejects a whole invalid batch and owns persisted/read buffers', async ({ page }) => {
  await page.goto('http://127.0.0.1:8321/');
  const result = await page.evaluate(async () => {
    const url: string = '/dist/store/index.js';
    const api = await import(url) as typeof import('../packages/store/dist/index.js');
    const cache = await api.openCache('openmesh-batch-' + crypto.randomUUID(), { maxRecordBytes: 16, maxOperations: 4 });
    const bytes = new Uint8Array([7]);
    const pending = cache.writeBatch([{ store: 'boxes', key: 'one', value: bytes }]);
    bytes.fill(9); await pending;
    const read = await cache.get('boxes', 'one');
    if (read) read.fill(2);
    let rejected = false;
    try { await cache.writeBatch([{ store: 'boxes', key: 'two', value: new Uint8Array([1]) },
      { store: 'outbox', key: 'two', value: new Uint8Array(17) }]); } catch { rejected = true; }
    const saved = await cache.get('boxes', 'one');
    const missing = await cache.get('boxes', 'two');
    await cache.writeBatch([{ store: 'boxes', key: 'one' }]);
    const removed = await cache.get('boxes', 'one');
    cache.close();
    return { rejected, saved: Array.from(saved ?? []), missing: missing === undefined, removed: removed === undefined };
  });
  expect(result).toEqual({ rejected: true, saved: [7], missing: true, removed: true });
});

test('P2-STORE-SCHEMA rejects incompatible existing databases and incomplete limits', async ({ page }) => {
  await page.goto('http://127.0.0.1:8321/');
  const result: unknown = await page.evaluate(`(async () => {
    const api = await import('/dist/store/index.js');
    const name = 'openmesh-invalid-' + crypto.randomUUID();
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    let schemaRejected = false;
    let limitsRejected = false;
    try {
      const cache = await api.openCache(name, { maxRecordBytes: 16, maxOperations: 4 });
      cache.close();
    } catch { schemaRejected = true; }
    try {
      const cache = await api.openCache('invalid-limits-' + crypto.randomUUID(), {});
      cache.close();
    } catch { limitsRejected = true; }
    indexedDB.deleteDatabase(name);
    return { schemaRejected, limitsRejected };
  })()`);
  expect(result).toEqual({ schemaRejected: true, limitsRejected: true });
});

test('P2-STORE-VERSION closes its connection for a newer schema', async ({ page }) => {
  await page.goto('http://127.0.0.1:8321/');
  const result: unknown = await page.evaluate(`(async () => {
    const api = await import('/dist/store/index.js');
    const name = 'openmesh-version-' + crypto.randomUUID();
    const cache = await api.openCache(name, { maxRecordBytes: 16, maxOperations: 4 });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    let closed = false;
    try { await cache.get('boxes', 'one'); } catch { closed = true; }
    let futureRejected = false;
    try { await api.openCache(name, { maxRecordBytes: 16, maxOperations: 4 }); }
    catch { futureRejected = true; }
    indexedDB.deleteDatabase(name);
    return { closed, futureRejected };
  })()`);
  expect(result).toEqual({ closed: true, futureRejected: true });
});

test('P2-STORE-CAPACITY reports bounds and keeps persistence requests explicit', async ({ page }) => {
  await page.goto('http://127.0.0.1:8321/');
  const result: unknown = await page.evaluate(`(async () => {
    const api = await import('/dist/store/index.js');
    let prompts = 0;
    const storage = {
      estimate: async () => ({ usage: 80, quota: 100 }),
      persisted: async () => false,
      persist: async () => { prompts++; return false; }
    };
    const status = await api.inspectStorage(storage);
    const before = prompts;
    const granted = await api.requestPersistence(storage);
    const unavailable = await api.inspectStorage({ estimate: async () => { throw new Error('unavailable'); } });
    return { status, before, prompts, granted, unavailable };
  })()`);
  expect(result).toEqual({ status: { available: true, usage: 80, quota: 100, remaining: 20,
    nearCapacity: true, persistent: false }, before: 0, prompts: 1, granted: false,
    unavailable: { available: false } });
});
