import { readFile } from 'node:fs/promises';
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

test('P2-OPFS stages indexed bytes and removes aborted imports', async ({ page }) => {
  await page.goto('http://127.0.0.1:8321/');
  const result: unknown = await page.evaluate(`(async () => {
    const api = await import('/dist/store/index.js');
    const root = await navigator.storage.getDirectory();
    const name = 'test-import-' + crypto.randomUUID();
    const parent = await root.getDirectoryHandle(name, { create: true });
    let published = false;
    const session = await api.createImportStaging(parent,
      { maxChunks: 4, maxChunkBytes: 1024, maxStagedBytes: 4096 },
      async () => { published = true; });
    await session.stageChunk(0, new Uint8Array([1, 2]));
    const chunks = [];
    for await (const item of session.readChunks()) chunks.push([...item.bytes]);
    await session.writePlaintext(0, new Uint8Array([7]));
    const before = published;
    await session.abort();
    const remaining = [];
    for await (const [key] of parent.entries()) remaining.push(key);
    await root.removeEntry(name, { recursive: true });
    return { chunks, before, published, remaining };
  })()`);
  expect(result).toEqual({ chunks: [[1, 2]], before: false, published: false, remaining: [] });
});

test('P2-OPFS-COMMIT publishes plaintext only and cleans failed sessions', async ({ page }) => {
  await page.goto('http://127.0.0.1:8321/');
  const result: unknown = await page.evaluate(`(async () => {
    const api = await import('/dist/store/index.js');
    const root = await navigator.storage.getDirectory();
    const name = 'test-publish-' + crypto.randomUUID();
    const parent = await root.getDirectoryHandle(name, { create: true });
    let files = []; let plaintext = [];
    const session = await api.createImportStaging(parent,
      { maxChunks: 2, maxChunkBytes: 16, maxStagedBytes: 32 }, async directory => {
        for await (const [key] of directory.entries()) files.push(key);
        const file = await (await directory.getFileHandle('plain-0')).getFile();
        plaintext = [...new Uint8Array(await file.arrayBuffer())];
      });
    await session.stageChunk(0, new Uint8Array([1, 2]));
    let incomplete = false;
    try { await session.commit(); } catch { incomplete = true; }
    await session.writePlaintext(0, new Uint8Array([7]));
    await session.commit();
    await session.abort();
    const failed = await api.createImportStaging(parent,
      { maxChunks: 2, maxChunkBytes: 16, maxStagedBytes: 32 }, async () => { throw new Error('publish failed'); });
    await failed.stageChunk(0, new Uint8Array([1]));
    await failed.writePlaintext(0, new Uint8Array([2]));
    let rejected = false;
    try { await failed.commit(); } catch { rejected = true; }
    let failedSessionClosed = false;
    try { await failed.stageChunk(1, new Uint8Array([9])); } catch { failedSessionClosed = true; }
    await failed.abort();
    const remaining = [];
    for await (const [key] of parent.entries()) remaining.push(key);
    await root.removeEntry(name, { recursive: true });
    return { files, plaintext, incomplete, rejected, failedSessionClosed, retainedSessions: remaining.length };
  })()`);
  expect(result).toEqual({ files: ['plain-0'], plaintext: [7], incomplete: true, rejected: true, failedSessionClosed: true, retainedSessions: 1 });
});

test('P2-OPFS-LIMIT rejects writes before staging exceeds its budget', async ({ page }) => {
  await page.goto('http://127.0.0.1:8321/');
  const result: unknown = await page.evaluate(`(async () => {
    const api = await import('/dist/store/index.js');
    const root = await navigator.storage.getDirectory();
    const name = 'test-budget-' + crypto.randomUUID();
    const parent = await root.getDirectoryHandle(name, { create: true });
    const session = await api.createImportStaging(parent,
      { maxChunks: 1, maxChunkBytes: 4, maxStagedBytes: 5 }, async () => {});
    let rejected = 0;
    try { await session.stageChunk(0, new Uint8Array(5)); } catch { rejected++; }
    await session.stageChunk(0, new Uint8Array([1, 2, 3, 4]));
    try { await session.stageChunk(1, new Uint8Array([1])); } catch { rejected++; }
    try { await session.writePlaintext(0, new Uint8Array([7, 8])); } catch { rejected++; }
    await session.abort();
    const entries = [];
    for await (const [key] of parent.entries()) entries.push(key);
    await root.removeEntry(name, { recursive: true });
    return { rejected, entries };
  })()`);
  expect(result).toEqual({ rejected: 3, entries: [] });
});

test('P2-BROWSER-ENGINE loads the same core entry through the engine module graph', async ({ page }) => {
  await page.goto('http://127.0.0.1:8321/');
  const result: unknown = await page.evaluate(`(async () => {
    const engine = await import('/dist/browser-engine/engine/index.js');
    const core = await import('/dist/browser-engine/core/index.js');
    return { importer: typeof engine.importBundle, opener: typeof core.openBox,
      crypto: !!crypto.subtle, opfs: typeof navigator.storage.getDirectory };
  })()`);
  expect(result).toEqual({ importer: 'function', opener: 'function', crypto: true, opfs: 'function' });
});

test('P2-OPFS-ENGINE imports a verified file and returns a Receipt, rolling back bad tails', async ({ page }) => {
  const document: unknown = JSON.parse(await readFile(new URL('../packages/test-vectors/envelopes.json', import.meta.url), 'utf8'));
  await page.goto('http://127.0.0.1:8321/');
  const result: unknown = await page.evaluate(`(async () => {
    const fixture = ${JSON.stringify(document)};
    const core = await import('/dist/browser-engine/core/index.js');
    const engine = await import('/dist/browser-engine/engine/index.js');
    const store = await import('/dist/store/index.js');
    const hex = text => Uint8Array.from(text.match(/../g) ?? [], byte => parseInt(byte, 16));
    const unwrap = result => { if (!result.ok) throw new Error(result.error); return result.value; };
    const actor = async name => {
      const item = fixture.actors.find(actor => actor.name === name);
      const seeds = item.seeds_hex.map(hex);
      return { keys: unwrap(await core.createIdentityKeys({ root: seeds[0], deviceSigning: seeds[1], deviceEncryption: seeds[2] })),
        contact: { root: hex(item.root_hex), certificate: hex(item.certificate_hex) } };
    };
    const alice = await actor('alice'); const bob = await actor('bob');
    const vector = fixture.vectors.find(item => item.id === 'chunked-65521');
    const box = hex(vector.wire_hex); const manifest = hex(vector.manifest_hex);
    const chunks = vector.chunks_hex.map(hex);
    const source = await engine.createVerifiedBundleSource(box, manifest,
      { async *open() { yield* chunks; } }, 16384, 200000);
    const parts = []; for await (const bytes of source.open()) parts.push(bytes);
    const original = new Uint8Array(await new Blob(parts).arrayBuffer());
    const root = await navigator.storage.getDirectory();
    const name = 'test-engine-' + crypto.randomUUID();
    const parent = await root.getDirectoryHandle(name, { create: true });
    const outcomes = [];
    try {
      for (const badTail of [false, true]) {
        let published = false; let outputHex = '';
        const session = await store.createImportStaging(parent,
          { maxChunks: 4, maxChunkBytes: 65536, maxStagedBytes: 200000 }, async directory => {
            const bytes = [];
            for (let index = 0; index < chunks.length; index++) {
              const file = await (await directory.getFileHandle('plain-' + index)).getFile();
              bytes.push(new Uint8Array(await file.arrayBuffer()));
            }
            const output = new Uint8Array(await new Blob(bytes).arrayBuffer());
            outputHex = Array.from(output, byte => byte.toString(16).padStart(2, '0')).join('');
            published = true;
          });
        const wire = badTail ? new Uint8Array([...original, 0]) : original;
        const result = await engine.importBundle({ size: wire.length, async *open() {
          for (let offset = 0; offset < wire.length; offset += 16384) yield wire.slice(offset, offset + 16384);
        } }, { maxBytes: 200000, maxReadBytes: 16384, maxRecordBytes: 70000, maxChunks: 4 },
        { recipient: bob, expectedSender: alice.contact, now: fixture.now }, session);
        let receiptAccepted = false;
        if (result.ok) {
          const receipt = unwrap(await core.createReceipt(result.value, { sender: bob, recipient: alice.contact,
            now: fixture.now, tag: new Uint8Array(16) }));
          receiptAccepted = (await core.verifyReceipt(receipt, { original: box, sender: alice,
            expectedRecipient: bob.contact, now: fixture.now })).ok;
        }
        outcomes.push({ ok: result.ok, published, matches: outputHex === vector.file_hex, receiptAccepted });
      }
    } finally { await root.removeEntry(name, { recursive: true }); }
    return outcomes;
  })()`);
  expect(result).toEqual([
    { ok: true, published: true, matches: true, receiptAccepted: true },
    { ok: false, published: false, matches: false, receiptAccepted: false },
  ]);
});
