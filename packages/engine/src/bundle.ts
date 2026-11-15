export interface BundleSource { size: number; open: () => AsyncIterable<Uint8Array> }
export interface BundleLimits { maxBytes: number; maxReadBytes: number; maxRecordBytes: number; maxChunks: number }
function requireCondition(value: unknown): asserts value {
  if (!value) throw new Error('Invalid or over-budget bundle');
}
function head(major: number, size: number): Uint8Array {
  requireCondition(Number.isSafeInteger(size) && size >= 0 && size <= 0xffffffff);
  if (size < 24) return new Uint8Array([(major << 5) | size]);
  const width = size < 256 ? 1 : size < 65536 ? 2 : 4;
  const output = new Uint8Array(width + 1);
  output[0] = (major << 5) | (width === 1 ? 24 : width === 2 ? 25 : 26);
  for (let index = width; index > 0; index--) { output[index] = size % 256; size = Math.floor(size / 256); }
  return output;
}
export interface BundleChunks {
  readonly sizes: readonly number[];
  open: () => AsyncIterable<Uint8Array>;
}
/** Container framing only. Consumers stage records until the entire decode succeeds. */
export function encodeBundle(box: Uint8Array, manifest: Uint8Array | null,
  chunks: readonly Uint8Array[] | BundleChunks, readBytes: number): AsyncGenerator<Uint8Array> {
  requireCondition(Number.isSafeInteger(readBytes) && readBytes > 0);
  requireCondition(box instanceof Uint8Array && box.length <= 2097152);
  requireCondition(manifest === null || (manifest instanceof Uint8Array && manifest.length <= 16777216));
  const control = new Uint8Array(box);
  const metadata = manifest === null ? null : new Uint8Array(manifest);
  let source: BundleChunks;
  if (Array.isArray(chunks)) {
    requireCondition(chunks.length <= 262144);
    const entries = chunks.slice() as Uint8Array[];
    source = { sizes: entries.map(chunk => chunk.length), async *open() {
      for (const chunk of entries) yield await Promise.resolve(chunk);
    } };
  } else source = chunks as BundleChunks;
  requireCondition(Array.isArray(source.sizes) && source.sizes.length <= 262144);
  const sizes = source.sizes.slice();
  const open = source.open.bind(source);
  for (const size of sizes) requireCondition(Number.isSafeInteger(size) && size >= 0 && size <= 1048576);
  requireCondition(metadata !== null || sizes.length === 0);
  async function* record(bytes: Uint8Array) {
    yield head(2, bytes.length);
    for (let offset = 0; offset < bytes.length; offset += readBytes) {
      yield await Promise.resolve(bytes.slice(offset, offset + readBytes));
    }
  }
  async function* pieces() {
    yield new Uint8Array([1, 0x83]);
    yield* record(control);
    if (metadata === null) yield new Uint8Array([0xf6]);
    else yield* record(metadata);
    yield head(4, sizes.length);
    let index = 0;
    for await (const chunk of open()) {
      requireCondition(chunk instanceof Uint8Array && index < sizes.length && chunk.length === sizes[index]);
      // Snapshot one chunk, never a whole-file collection.
      yield* record(new Uint8Array(chunk));
      index++;
    }
    requireCondition(index === sizes.length);
  }
  async function* output() {
    for await (const piece of pieces()) {
      for (let offset = 0; offset < piece.length; offset += readBytes) yield piece.slice(offset, offset + readBytes);
    }
  }
  return output();
}

/** Decode framing only. Callback order is Box, optional Manifest, then chunks. */
export async function decodeBundle(source: BundleSource, limits: BundleLimits,
  stage: (record: Uint8Array, kind: 'box' | 'manifest' | 'chunk', index: number) => Promise<void>): Promise<void> {
  const size = source.size;
  const open = source.open.bind(source);
  const bounds = { ...limits };
  for (const limit of Object.values(bounds)) requireCondition(Number.isSafeInteger(limit) && limit > 0);
  requireCondition(Number.isSafeInteger(size) && size >= 0 && size <= bounds.maxBytes);
  const iterator = open()[Symbol.asyncIterator]();
  let pending = new Uint8Array(0);
  let offset = 0;
  let consumed = 0;
  let received = 0;
  async function read(length: number): Promise<Uint8Array> {
    requireCondition(length <= size - consumed);
    const output = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      if (offset === pending.length) {
        const next = await iterator.next();
        requireCondition(!next.done && next.value instanceof Uint8Array);
        requireCondition(next.value.length > 0 && next.value.length <= bounds.maxReadBytes
          && next.value.length <= size - received);
        pending = new Uint8Array(next.value);
        received += pending.length;
        offset = 0;
      }
      const count = Math.min(length - written, pending.length - offset);
      output.set(pending.subarray(offset, offset + count), written);
      written += count; offset += count; consumed += count;
    }
    return output;
  }
  async function byte() { const value = (await read(1))[0]; requireCondition(value !== undefined); return value; }
  async function length(first: number, major: number, cap: number): Promise<number> {
    requireCondition(first >> 5 === major);
    const extra = first & 31;
    if (extra < 24) { requireCondition(extra <= cap); return extra; }
    requireCondition(extra >= 24 && extra <= 26);
    const width = 2 ** (extra - 24);
    let result = 0;
    for (const value of await read(width)) result = result * 256 + value;
    requireCondition(result >= (width === 1 ? 24 : width === 2 ? 256 : 65536) && result <= cap);
    return result;
  }
  async function record(first: number, kind: 'box' | 'manifest' | 'chunk', index: number) {
    const cap = kind === 'box' ? 2097152 : kind === 'manifest' ? 16777216 : 1048576;
    const count = await length(first, 2, Math.min(cap, bounds.maxRecordBytes));
    await stage(await read(count), kind, index);
  }
  try {
    requireCondition(await byte() === 1);
    requireCondition(await byte() === 0x83);
    await record(await byte(), 'box', 0);
    const marker = await byte();
    if (marker !== 0xf6) await record(marker, 'manifest', 0);
    const count = await length(await byte(), 4, Math.min(bounds.maxChunks, 262144));
    requireCondition(marker !== 0xf6 || count === 0);
    for (let index = 0; index < count; index++) await record(await byte(), 'chunk', index);
    requireCondition(consumed === size && offset === pending.length);
    requireCondition((await iterator.next()).done);
  } finally {
    await iterator.return?.();
  }
}

/** Exact-size opaque source for the file carrier. Chunk storage stays caller-owned. */
export function createBundleSource(box: Uint8Array, manifest: Uint8Array | null,
  chunks: BundleChunks, readBytes: number, maxBytes: number): BundleSource {
  requireCondition(Number.isSafeInteger(maxBytes) && maxBytes > 0);
  requireCondition(box instanceof Uint8Array && box.length <= 2097152);
  requireCondition(manifest === null || (manifest instanceof Uint8Array && manifest.length <= 16777216));
  requireCondition(Array.isArray(chunks.sizes) && chunks.sizes.length <= 262144);
  requireCondition(Number.isSafeInteger(readBytes) && readBytes > 0);
  const control = new Uint8Array(box);
  const metadata = manifest === null ? null : new Uint8Array(manifest);
  const sizes: number[] = (chunks.sizes as readonly number[]).slice();
  const open = chunks.open.bind(chunks);
  requireCondition(metadata !== null || sizes.length === 0);
  let size = 2 + head(2, control.length).length + control.length
    + (metadata === null ? 1 : head(2, metadata.length).length + metadata.length)
    + head(4, sizes.length).length;
  for (const length of sizes) {
    requireCondition(Number.isSafeInteger(length) && length >= 0 && length <= 1048576);
    size += head(2, length).length + length;
    requireCondition(Number.isSafeInteger(size) && size <= maxBytes);
  }
  requireCondition(size <= maxBytes);
  return Object.freeze({ size, open: () => encodeBundle(control, metadata, { sizes, open }, readBytes) });
}
