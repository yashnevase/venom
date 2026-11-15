export {};

const databaseName = 'openmesh-s4-diagnostic-v1';
const fixture = new Uint8Array([1, 2, 3]);
const run = document.querySelector<HTMLButtonElement>('#run');
const remove = document.querySelector<HTMLButtonElement>('#remove');
const select = document.querySelector<HTMLButtonElement>('#select');
const output = document.querySelector<HTMLTextAreaElement>('#report');
const status = document.querySelector<HTMLElement>('[role="status"]');
if (!run || !remove || !select || !output || !status) throw new Error('Missing diagnostic control');

function check(condition: boolean): void {
  if (!condition) throw new Error('FixtureMismatch');
}
function equal(first: ArrayBuffer, second: ArrayBuffer): boolean {
  const bytes = new Uint8Array(first);
  const other = new Uint8Array(second);
  return bytes.length === other.length && bytes.every((byte, index) => byte === other[index]);
}

async function nativeCrypto() {
  const exercises: { algorithm: string; exercise: () => Promise<void> }[] = [
    { algorithm: 'Ed25519', exercise: async () => {
      const pair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
      if (!('privateKey' in pair)) throw new Error('InvalidKeyPair');
      const signature = await crypto.subtle.sign('Ed25519', pair.privateKey, fixture);
      check(signature.byteLength === 64 && !pair.privateKey.extractable);
      check(await crypto.subtle.verify('Ed25519', pair.publicKey, signature, fixture));
      check(!await crypto.subtle.verify('Ed25519', pair.publicKey, signature, new Uint8Array([1, 2, 4])));
    } },
    { algorithm: 'X25519', exercise: async () => {
      const first = await crypto.subtle.generateKey('X25519', false, ['deriveBits']);
      const second = await crypto.subtle.generateKey('X25519', false, ['deriveBits']);
      if (!('privateKey' in first) || !('privateKey' in second)) throw new Error('InvalidKeyPair');
      const a = await crypto.subtle.deriveBits({ name: 'X25519', public: second.publicKey }, first.privateKey, 256);
      const b = await crypto.subtle.deriveBits({ name: 'X25519', public: first.publicKey }, second.privateKey, 256);
      check(a.byteLength === 32 && equal(a, b));
    } },
    { algorithm: 'HKDF-SHA256', exercise: async () => {
      const key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(11), 'HKDF', false, ['deriveBits']);
      const params = { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: fixture };
      const first = await crypto.subtle.deriveBits(params, key, 256);
      const second = await crypto.subtle.deriveBits(params, key, 256);
      check(first.byteLength === 32 && equal(first, second));
    } },
    { algorithm: 'AES-256-GCM', exercise: async () => {
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const params = { name: 'AES-GCM', iv: crypto.getRandomValues(new Uint8Array(12)), tagLength: 128 };
      const ciphertext = await crypto.subtle.encrypt(params, key, fixture);
      const plaintext = await crypto.subtle.decrypt(params, key, ciphertext);
      check(ciphertext.byteLength === fixture.byteLength + 16 && equal(plaintext, fixture.buffer));
    } },
    { algorithm: 'HMAC-SHA256', exercise: async () => {
      const key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(11), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
      const mac = await crypto.subtle.sign('HMAC', key, fixture);
      check(mac.byteLength === 32 && await crypto.subtle.verify('HMAC', key, mac, fixture));
    } },
    { algorithm: 'SHA-256', exercise: async () => {
      const digest = await crypto.subtle.digest('SHA-256', fixture);
      check(digest.byteLength === 32);
    } },
  ];
  const rows = [];
  for (const { algorithm, exercise } of exercises) {
    const started = performance.now();
    try {
      await exercise();
      rows.push({ algorithm, supported: true, elapsed_ms: performance.now() - started });
    } catch (error) {
      rows.push({ algorithm, supported: false, elapsed_ms: performance.now() - started,
        error: error instanceof Error ? error.name : 'UnknownError' });
    }
  }
  return rows;
}

async function storageRoundtrip() {
  const started = performance.now();
  let database: IDBDatabase | undefined;
  try {
    database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      let abandoned = false;
      request.onupgradeneeded = () => { request.result.createObjectStore('probe'); };
      request.onerror = () => { reject(request.error ?? new Error('StorageOpenFailed')); };
      request.onblocked = () => { abandoned = true; reject(new Error('StorageBlocked')); };
      request.onsuccess = () => {
        if (abandoned) { request.result.close(); return; }
        request.result.onversionchange = () => { request.result.close(); };
        resolve(request.result);
      };
    });
    // Public scratch token used only to observe persistence across file reloads.
    const token = `${String(Date.now())}-${String(Math.random())}`;
    const transaction = database.transaction('probe', 'readwrite');
    const store = transaction.objectStore('probe');
    const previous = store.get('fixture');
    store.put(token, 'fixture');
    const current = store.get('fixture');
    const result = await new Promise<{ previous_token: string | null; roundtrip: boolean }>((resolve, reject) => {
      transaction.oncomplete = () => {
        const value: unknown = previous.result;
        resolve({ previous_token: typeof value === 'string' ? value : null, roundtrip: current.result === token });
      };
      transaction.onabort = () => { reject(transaction.error ?? new Error('TransactionAborted')); };
    });
    return { ok: true, ...result, written_token: token, elapsed_ms: performance.now() - started };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.name : 'UnknownError', elapsed_ms: performance.now() - started };
  } finally {
    database?.close();
  }
}

async function sourceFetch() {
  try {
    const response = await fetch(location.href);
    return { ok: response.ok, bytes: (await response.arrayBuffer()).byteLength };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.name : 'UnknownError' };
  }
}

run.addEventListener('click', () => {
  run.disabled = true;
  remove.disabled = true;
  status.textContent = 'Running';
  void Promise.all([nativeCrypto(), storageRoundtrip(), sourceFetch()]).then(([algorithms, storage, source]) => {
    output.value = JSON.stringify({ probe: 'S-4-capabilities', v: 1, measured_at: new Date().toISOString(),
      protocol: location.protocol, origin: location.origin, secure_context: isSecureContext,
      user_agent: navigator.userAgent, crypto: algorithms, storage, source_fetch: source }, null, 2);
    status.textContent = 'Complete';
  }).catch((error: unknown) => {
    output.value = JSON.stringify({ outcome: 'failed', error: error instanceof Error ? error.name : 'UnknownError' });
    status.textContent = 'Failed';
  }).finally(() => { run.disabled = false; remove.disabled = false; });
});

remove.addEventListener('click', () => {
  run.disabled = true;
  remove.disabled = true;
  try {
    const request = indexedDB.deleteDatabase(databaseName);
    const finish = (message: string) => { status.textContent = message; run.disabled = false; remove.disabled = false; };
    request.onsuccess = () => { finish('Test data removed'); };
    request.onerror = () => { finish('Removal failed'); };
    request.onblocked = () => { status.textContent = 'Removal blocked'; };
  } catch {
    status.textContent = 'Removal failed';
    run.disabled = false;
    remove.disabled = false;
  }
});
select.addEventListener('click', () => { output.focus(); output.select(); });
