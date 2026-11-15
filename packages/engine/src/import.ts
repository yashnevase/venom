import { openBox, openFile, parseManifest, verifyChunk } from '@openmesh/core';
import type { OpenBoxOptions, OpenedBox } from '@openmesh/core';
import { decodeBundle } from './bundle.js';
import type { BundleSource, BundleLimits } from './bundle.js';
export interface ImportTransaction {
  stageChunk: (index: number, bytes: Uint8Array) => Promise<void>;
  readChunks: () => AsyncIterable<{ index: number; bytes: Uint8Array }>;
  writePlaintext: (index: number, bytes: Uint8Array) => Promise<void>;
  commit: (opened: OpenedBox) => Promise<void>;
  abort: () => Promise<void>;
}
/** Caller transaction stages ciphertext/plaintext on disk and publishes atomically. */
export async function importBundle(source: BundleSource, limits: BundleLimits,
  verification: OpenBoxOptions, transaction: ImportTransaction): Promise<
  { ok: true; value: OpenedBox } | { ok: false; error: string }> {
  let opened: OpenedBox | undefined;
  let manifest: Uint8Array | undefined;
  let count = 0;
  let expectedCount = 0;
  let chunkIds: Uint8Array[] = [];
  let chunkSizes: bigint[] = [];
  const tx = { ...transaction };
  try {
    const snapshotContact = (contact: OpenBoxOptions['expectedSender']) => {
      if (contact.root.length !== 32 || contact.certificate.length > 1024
        || (contact.revocation && contact.revocation.length > 1024)) throw new Error('Invalid contact');
      return { root: new Uint8Array(contact.root), certificate: new Uint8Array(contact.certificate),
        ...(contact.revocation ? { revocation: new Uint8Array(contact.revocation) } : {}) };
    };
    const policy: OpenBoxOptions = { now: verification.now,
      expectedSender: snapshotContact(verification.expectedSender),
      recipient: { keys: verification.recipient.keys, contact: snapshotContact(verification.recipient.contact) } };
    const bounds = { ...limits };
    await decodeBundle(source, bounds, async (bytes, kind, index) => {
      if (kind === 'box') {
        const result = await openBox(bytes, policy);
        if (!result.ok) throw new Error(result.error);
        opened = result.value;
      } else if (kind === 'manifest') {
        if (opened?.header.profile !== 'chunked') throw new Error('Unexpected manifest');
        const parsed = parseManifest(bytes, { maxChunks: bounds.maxChunks });
        if (!parsed.ok) throw new Error(parsed.error);
        const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes.slice(1)));
        const expected = opened.header.manifest_hash;
        if (!expected || !digest.every((byte, offset) => byte === expected[offset])) throw new Error('Manifest mismatch');
        if (parsed.value.get('chunk_size') !== opened.header.chunk_size) throw new Error('Chunk size mismatch');
        chunkIds = parsed.value.get('chunk_ids') as Uint8Array[];
        chunkSizes = parsed.value.get('chunk_sizes') as bigint[];
        expectedCount = Number(parsed.value.get('count'));
        manifest = bytes;
      } else {
        if (!manifest || index !== count || count >= expectedCount) throw new Error('Unexpected chunk');
        const expected = chunkIds[index];
        if (!expected || BigInt(bytes.length) !== chunkSizes[index]) throw new Error('Chunk size mismatch');
        const checked = await verifyChunk(bytes, expected, 1048576);
        if (!checked.ok) throw new Error(checked.error);
        await tx.stageChunk(index, checked.value);
        count++;
      }
    });
    if (!opened) throw new Error('Missing Box');
    if (opened.header.profile === 'chunked') {
      if (!manifest || count !== expectedCount) throw new Error('Incomplete bundle');
      const result = await openFile(opened, { manifest, source: tx.readChunks(), emit: tx.writePlaintext });
      if (!result.ok) throw new Error(result.error);
    } else if (manifest || count > 0) throw new Error('Unexpected file data');
    await tx.commit(opened);
    return { ok: true, value: opened };
  } catch (error) {
    try { await tx.abort(); }
    catch { return { ok: false, error: 'rollback-failed' }; }
    return { ok: false, error: error instanceof Error ? error.message : 'import-failed' };
  }
}
