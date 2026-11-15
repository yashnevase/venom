export interface StagingLimits { maxChunks: number; maxChunkBytes: number; maxStagedBytes: number }
/** Publication callback atomically records visibility only after engine verification. */
export async function createImportStaging(parent: FileSystemDirectoryHandle, limits: StagingLimits,
  publish: (directory: FileSystemDirectoryHandle) => Promise<void>) {
  const bounds = { ...limits };
  if (![bounds.maxChunks, bounds.maxChunkBytes, bounds.maxStagedBytes]
    .every(value => Number.isSafeInteger(value) && value > 0)
    || bounds.maxChunks > 262144 || bounds.maxChunkBytes > 1048576) throw new Error('Invalid staging limits');
  const name = crypto.randomUUID();
  const directory = await parent.getDirectoryHandle(name, { create: true });
  let state: 'staging' | 'publishing' | 'published' | 'aborted' | 'failed' = 'staging';
  let bytesWritten = 0;
  let ciphertextCount = 0;
  let plaintextCount = 0;
  let busy = false;
  function requireStaging() {
    if (state !== 'staging') throw new Error('Staging unavailable');
  }
  async function write(kind: 'cipher' | 'plain', index: number, bytes: Uint8Array) {
    if (state !== 'staging' || busy || !Number.isSafeInteger(index) || index < 0
      || index >= bounds.maxChunks || !(bytes instanceof Uint8Array)
      || bytes.length > bounds.maxChunkBytes || bytes.length > bounds.maxStagedBytes - bytesWritten
      || index !== (kind === 'cipher' ? ciphertextCount : plaintextCount)) throw new Error('Invalid staging write');
    busy = true;
    const copy = new Uint8Array(bytes);
    try {
      const handle = await directory.getFileHandle(kind + '-' + String(index), { create: true });
      const output = await handle.createWritable();
      try { await output.write(copy); await output.close(); }
      catch (error) { try { await output.abort(); } catch { /* session abort cleans staging */ } throw error; }
      bytesWritten += copy.length;
      if (kind === 'cipher') ciphertextCount++; else plaintextCount++;
    } finally { busy = false; }
  }
  return {
    stageChunk: (index: number, bytes: Uint8Array) => write('cipher', index, bytes),
    writePlaintext: (index: number, bytes: Uint8Array) => write('plain', index, bytes),
    async *readChunks() {
      if (state !== 'staging' || busy) throw new Error('Staging unavailable');
      const count = ciphertextCount;
      for (let index = 0; index < count; index++) {
        requireStaging();
        const file = await (await directory.getFileHandle('cipher-' + String(index))).getFile();
        if (file.size > bounds.maxChunkBytes) throw new Error('Staged chunk too large');
        yield { index, bytes: new Uint8Array(await file.arrayBuffer()) };
      }
    },
    async commit() {
      if (state !== 'staging' || busy || ciphertextCount !== plaintextCount) throw new Error('Incomplete staging');
      state = 'publishing';
      try {
        for (let index = 0; index < ciphertextCount; index++) await directory.removeEntry('cipher-' + String(index));
        await publish(directory);
        state = 'published';
      } catch (error) { state = 'failed'; throw error; }
    },
    async abort() {
      if (state === 'published' || state === 'aborted') return;
      if (busy || state === 'publishing') throw new Error('Staging operation active');
      await parent.removeEntry(name, { recursive: true });
      state = 'aborted';
    },
  };
}
