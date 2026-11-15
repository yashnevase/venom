/** In-process view over opaque protocol/container bytes. Each open is a fresh read. */
export interface SealedBox {
  readonly size: number;
  open: () => AsyncIterable<Uint8Array>;
}
export type FileCarrierErrorCode = 'invalid-input' | 'invalid-limit' | 'limit-exceeded'
  | 'size-mismatch' | 'unavailable' | 'export-failed' | 'import-failed';
export class FileCarrierError extends Error {
  constructor(readonly code: FileCarrierErrorCode) { super(code); }
}
export type PutResult = { ok: true; outcome: 'exported' }
  | { ok: false; error: FileCarrierErrorCode };
export interface Carrier {
  readonly id: string;
  readonly caps: { readonly direction: 'send' | 'receive' | 'both'; readonly maxBoxBytes: number;
    readonly latency: 'live' | 'async' | 'manual'; readonly needsInternet: boolean };
  available(): Promise<boolean>;
  put(box: SealedBox, opts?: { tag?: Uint8Array }): Promise<PutResult>;
  poll(tags: Uint8Array[], since?: number): AsyncIterable<SealedBox>;
}
export interface FileWriter {
  write: (bytes: Uint8Array) => Promise<void>;
  commit: () => Promise<void>;
  abort: () => Promise<void>;
}
export interface FileCarrierOptions {
  maxBoxBytes: number;
  maxReadBytes: number;
  maxPollRecords: number;
  available: () => Promise<boolean>;
  beginExport: (size: number, opts: { tag?: Uint8Array }) => Promise<FileWriter>;
  readImports: (tags: Uint8Array[], since?: number) => AsyncIterable<SealedBox>;
}
function demand(condition: unknown, code: FileCarrierErrorCode): asserts condition {
  if (!condition) throw new FileCarrierError(code);
}
function positive(value: number): number {
  demand(Number.isSafeInteger(value) && value > 0, 'invalid-limit');
  return value;
}
function tagCopy(value: unknown): Uint8Array {
  demand(value instanceof Uint8Array && value.length === 16, 'invalid-input');
  return new Uint8Array(value);
}
function sealedSource(input: SealedBox, maxBytes: number, maxRead: number): SealedBox {
  const size = input.size;
  const open = input.open.bind(input);
  demand(Number.isSafeInteger(size) && size >= 0 && typeof open === 'function', 'invalid-input');
  demand(size <= maxBytes, 'limit-exceeded');
  return Object.freeze({ size, async *open() {
    let received = 0;
    try {
      for await (const chunk of open()) {
        demand(chunk instanceof Uint8Array && chunk.length > 0, 'invalid-input');
        demand(chunk.length <= maxRead, 'limit-exceeded');
        demand(chunk.length <= size - received, 'size-mismatch');
        const owned = new Uint8Array(chunk);
        received += owned.length;
        yield owned;
      }
      demand(received === size, 'size-mismatch');
    } catch (error) {
      if (error instanceof FileCarrierError) throw error;
      throw new FileCarrierError('import-failed');
    }
  } });
}

/** Manual carrier with caller-owned file selection, staging and commit adapters. */
export class FileCarrier implements Carrier {
  readonly id = 'file';
  readonly caps: Carrier['caps'];
  private readonly readLimit: number;
  private readonly pollLimit: number;
  private readonly adapters: Pick<FileCarrierOptions, 'available' | 'beginExport' | 'readImports'>;

  constructor(options: FileCarrierOptions) {
    this.caps = Object.freeze({ direction: 'both', maxBoxBytes: positive(options.maxBoxBytes),
      latency: 'manual', needsInternet: false });
    this.readLimit = positive(options.maxReadBytes);
    this.pollLimit = positive(options.maxPollRecords);
    this.adapters = { available: options.available, beginExport: options.beginExport, readImports: options.readImports };
  }

  async available(): Promise<boolean> {
    try { return await this.adapters.available(); }
    catch { return false; }
  }

  async put(box: SealedBox, opts: { tag?: Uint8Array } = {}): Promise<PutResult> {
    let writer: FileWriter | undefined;
    try {
      const source = sealedSource(box, this.caps.maxBoxBytes, this.readLimit);
      const metadata = opts.tag === undefined ? {} : { tag: tagCopy(opts.tag) };
      if (!await this.available()) return { ok: false, error: 'unavailable' };
      writer = await this.adapters.beginExport(source.size, metadata);
      for await (const bytes of source.open()) await writer.write(bytes);
      await writer.commit();
      return { ok: true, outcome: 'exported' };
    } catch (error) {
      if (writer) {
        try { await writer.abort(); }
        catch { return { ok: false, error: 'export-failed' }; }
      }
      return { ok: false, error: error instanceof FileCarrierError ? error.code : 'export-failed' };
    }
  }

  poll(tags: Uint8Array[], since?: number): AsyncGenerator<SealedBox> {
    // Snapshot filters at invocation, before the async generator begins execution.
    let filters: Uint8Array[];
    try {
      demand(Array.isArray(tags) && tags.length <= 64, 'limit-exceeded');
      filters = tags.map(tagCopy);
      demand(since === undefined || (Number.isSafeInteger(since) && since >= 0), 'invalid-input');
    } catch (error) {
      return this.failedPoll(error);
    }
    return this.imports(filters, since);
  }

  private async *failedPoll(error: unknown): AsyncGenerator<SealedBox> {
    yield await Promise.reject<SealedBox>(error instanceof FileCarrierError
      ? error : new FileCarrierError('invalid-input'));
  }

  private async *imports(tags: Uint8Array[], since?: number): AsyncGenerator<SealedBox> {
    try {
      demand(await this.available(), 'unavailable');
      let count = 0;
      for await (const record of this.adapters.readImports(tags, since)) {
        count++;
        demand(count <= this.pollLimit, 'limit-exceeded');
        yield sealedSource(record, this.caps.maxBoxBytes, this.readLimit);
      }
    } catch (error) {
      if (error instanceof FileCarrierError) throw error;
      throw new FileCarrierError('import-failed');
    }
  }
}

/** Read a browser File/Blob in explicit slices without arrayBuffer() on the whole file. */
export function sourceFromBlob(blob: Blob, readBytes: number): SealedBox {
  const readLimit = positive(readBytes);
  const size = blob.size;
  demand(Number.isSafeInteger(size) && size >= 0 && typeof blob.slice === 'function', 'invalid-input');
  return Object.freeze({ size, async *open() {
    for (let offset = 0; offset < size; offset += readLimit) {
      const end = Math.min(size, offset + readLimit);
      const data = new Uint8Array(await blob.slice(offset, end).arrayBuffer());
      demand(data.length === end - offset, 'size-mismatch');
      yield data;
    }
  } });
}
