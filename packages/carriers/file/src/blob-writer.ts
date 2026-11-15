import type { FileWriter } from './index.js';

/** Bounded in-memory artifact staging. Publisher owns the eventual download UI. */
export function createBlobWriter(
  declaredSize: number,
  maxBytes: number,
  publish: (blob: Blob) => Promise<void>,
): FileWriter {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0
    || !Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > maxBytes) {
    throw new Error('Invalid Blob staging limit');
  }
  let state: 'writing' | 'committing' | 'committed' | 'aborted' = 'writing';
  let pieces: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  return {
    write(bytes) {
      if (state !== 'writing' || !(bytes instanceof Uint8Array)
        || bytes.length > declaredSize - received) {
        return Promise.reject(new Error('Invalid Blob write'));
      }
      pieces.push(new Uint8Array(bytes));
      received += bytes.length;
      return Promise.resolve();
    },
    async commit() {
      if (state !== 'writing' || received !== declaredSize) throw new Error('Incomplete Blob staging');
      state = 'committing';
      const artifact = new Blob(pieces, { type: 'application/octet-stream' });
      pieces = [];
      try {
        await publish(artifact);
        state = 'committed';
      } catch (error) {
        state = 'aborted';
        throw error;
      }
    },
    abort() {
      if (state === 'committing') return Promise.reject(new Error('Publisher is already running'));
      if (state !== 'committed') state = 'aborted';
      pieces = [];
      return Promise.resolve();
    },
  };
}
