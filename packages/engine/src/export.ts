import { parseBox, parseManifest, verifyChunk } from '@openmesh/core';
import { createBundleSource } from './bundle.js';
import type { BundleSource } from './bundle.js';

/** Validate export linkage and ciphertext hashes. Sender authenticity is checked on import. */
export async function createVerifiedBundleSource(box: Uint8Array, manifest: Uint8Array | null,
  chunks: { open: () => AsyncIterable<Uint8Array> }, readBytes: number, maxBytes: number): Promise<BundleSource> {
  if (!(box instanceof Uint8Array) || box.length > 2097152
    || (manifest !== null && (!(manifest instanceof Uint8Array) || manifest.length > 16777217))) {
    throw new Error('Export record limit exceeded');
  }
  const control = new Uint8Array(box);
  const metadata = manifest === null ? null : new Uint8Array(manifest);
  const open = chunks.open.bind(chunks);
  const parsed = parseBox(control);
  if (!parsed.ok) throw new Error(parsed.error);
  if (parsed.value.header.profile !== 'chunked') {
    if (metadata !== null) throw new Error('Unexpected manifest');
    return createBundleSource(control, null, { sizes: [], open }, readBytes, maxBytes);
  }
  if (!metadata) throw new Error('Missing manifest');
  const record = parseManifest(metadata);
  if (!record.ok) throw new Error(record.error);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', metadata.slice(1)));
  const expected = parsed.value.header.manifest_hash;
  if (!expected || !digest.every((byte, index) => byte === expected[index])) throw new Error('Manifest hash mismatch');
  if ((record.value.get('chunk_size') as bigint) !== parsed.value.header.chunk_size) throw new Error('Chunk size mismatch');
  const sizes = (record.value.get('chunk_sizes') as bigint[]).map(Number);
  const ids = record.value.get('chunk_ids') as Uint8Array[];
  return createBundleSource(control, metadata, { sizes, async *open() {
    let index = 0;
    for await (const bytes of open()) {
      const expectedId = ids[index];
      if (!expectedId || bytes.length !== sizes[index]) throw new Error('Unexpected chunk');
      const checked = await verifyChunk(bytes, expectedId, 1048576);
      if (!checked.ok) throw new Error(checked.error);
      yield checked.value;
      index++;
    }
    if (index !== sizes.length) throw new Error('Missing chunk');
  } }, readBytes, maxBytes);
}
