import { describe, expect, it } from 'vitest';
import { FileCarrier, sourceFromBlob } from './src/index.js';
import type { SealedBox, FileWriter, FileCarrierOptions } from './src/index.js';

const policy = { maxBoxBytes: 1024, maxReadBytes: 128, maxPollRecords: 4 };
function opaque(data: Uint8Array): SealedBox {
  return { size: data.length, async *open() {
    for (let i = 0; i < data.length; i += 32) yield await Promise.resolve(data.subarray(i, i + 32));
  } };
}
function harness(overrides: Partial<FileCarrierOptions> = {}) {
  const events: string[] = [];
  const output: Uint8Array[] = [];
  const writer: FileWriter = {
    write: bytes => { events.push('write'); output.push(bytes); return Promise.resolve(); },
    commit: () => { events.push('commit'); return Promise.resolve(); },
    abort: () => { events.push('abort'); output.length = 0; return Promise.resolve(); },
  };
  const carrier = new FileCarrier({ ...policy, available: () => Promise.resolve(true),
    beginExport: () => { events.push('begin'); return Promise.resolve(writer); },
    async *readImports() {}, ...overrides });
  return { carrier, writer, events, output };
}
async function collect(source: SealedBox) {
  const pieces: Uint8Array[] = [];
  for await (const piece of source.open()) pieces.push(piece);
  return Buffer.concat(pieces);
}

describe('Phase 2 manual file carrier', () => {
  it('implements the decided Carrier capabilities and exports uninterpreted bytes', async () => {
    const { carrier, output, events } = harness();
    expect(carrier.id).toBe('file');
    expect(carrier.caps).toEqual({ direction: 'both', maxBoxBytes: 1024, latency: 'manual', needsInternet: false });
    expect(await carrier.available()).toBe(true);
    const bytes = Uint8Array.from({ length: 300 }, (_, index) => index % 251);
    expect(await carrier.put(opaque(bytes), { tag: new Uint8Array(16) })).toEqual({ ok: true, outcome: 'exported' });
    expect(Buffer.concat(output)).toEqual(Buffer.from(bytes));
    expect(events.at(-1)).toBe('commit');
    expect(events).not.toContain('abort');
  });

  it('streams Blob slices through a bounded source including empty input', async () => {
    for (const length of [0, 1, 128, 301]) {
      const data = new Uint8Array(length).fill(7);
      const source = sourceFromBlob(new Blob([data]), 64);
      const chunks: Uint8Array[] = [];
      for await (const chunk of source.open()) { expect(chunk.length).toBeLessThanOrEqual(64); chunks.push(chunk); }
      expect(Buffer.concat(chunks)).toEqual(Buffer.from(data));
      expect(source.size).toBe(length);
    }
  });

  it('rejects oversized and invalid declarations without opening source or writer', async () => {
    let opened = false;
    const source: SealedBox = { size: 1025, async *open() { opened = true; yield await Promise.resolve(new Uint8Array(1)); } };
    const { carrier, events } = harness();
    expect(await carrier.put(source)).toEqual({ ok: false, error: 'limit-exceeded' });
    expect(opened).toBe(false);
    expect(events).toEqual([]);
    for (const size of [-1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect((await carrier.put({ ...source, size })).ok).toBe(false);
    }
  });

  it('aborts on truncated, excessive or oversized source buffers and closes the source', async () => {
    for (const [declared, bytes] of [[20, 10], [10, 20], [200, 129]]) {
      if (declared === undefined || bytes === undefined) throw new Error('Missing fixture');
      let closed = false;
      const source: SealedBox = { size: declared, async *open() {
        try { yield await Promise.resolve(new Uint8Array(bytes)); }
        finally { closed = true; }
      } };
      const { carrier, output, events } = harness();
      expect((await carrier.put(source)).ok).toBe(false);
      expect(closed).toBe(true);
      expect(events.at(-1)).toBe('abort');
      expect(events).not.toContain('commit');
      expect(output).toEqual([]);
    }
  });

  it('awaits writes before pulling more input and owns each exported buffer', async () => {
    const original = new Uint8Array(10).fill(7);
    let pulls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const output: Uint8Array[] = [];
    const { carrier } = harness({ beginExport: () => Promise.resolve({
      write: async bytes => { original.fill(9); output.push(bytes); await gate; },
      commit: () => Promise.resolve(), abort: () => Promise.resolve(),
    }) });
    const transfer = carrier.put({ size: 20, async *open() {
      pulls++; yield await Promise.resolve(original);
      pulls++; yield await Promise.resolve(new Uint8Array(10));
    } });
    for (let i = 0; i < 10 && output.length === 0; i++) await Promise.resolve();
    expect(pulls).toBe(1);
    expect(output[0]).toEqual(new Uint8Array(10).fill(7));
    release();
    expect((await transfer).ok).toBe(true);
    expect(pulls).toBe(2);
  });

  it('aborts failed writes and commits, returns a typed failure and permits a retry', async () => {
    for (const stage of ['write', 'commit']) {
      let fail = true;
      const calls: string[] = [];
      const { carrier } = harness({ beginExport: () => Promise.resolve({
        write: () => { if (fail && stage === 'write') return Promise.reject(new Error('write')); return Promise.resolve(); },
        commit: () => { if (fail && stage === 'commit') return Promise.reject(new Error('commit')); return Promise.resolve(); },
        abort: () => { calls.push('abort'); return Promise.resolve(); },
      }) });
      expect(await carrier.put(opaque(new Uint8Array(10)))).toEqual({ ok: false, error: 'export-failed' });
      expect(calls).toEqual(['abort']);
      fail = false;
      expect((await carrier.put(opaque(new Uint8Array(10)))).ok).toBe(true);
    }
  });

  it('forwards owned routing filters to manual imports and bounds their stream on consumption', async () => {
    const tag = new Uint8Array(16).fill(3);
    let filters: Uint8Array[] = [];
    let sinceValue: number | undefined;
    const imported = opaque(new Uint8Array(20).fill(4));
    const { carrier } = harness({ async *readImports(tags, since) {
      filters = tags; sinceValue = since;
      yield await Promise.resolve(imported);
    } });
    const poll = carrier.poll([tag], 123);
    tag.fill(5);
    const first = await poll.next();
    expect(first.done).toBe(false);
    expect(filters[0]).toEqual(new Uint8Array(16).fill(3));
    expect(sinceValue).toBe(123);
    if (first.done) throw new Error('Missing record');
    expect(await collect(first.value)).toEqual(Buffer.from(new Uint8Array(20).fill(4)));
    expect((await poll.next()).done).toBe(true);
  });

  it('closes manual enumeration on caller cancellation and rejects excess/oversized records', async () => {
    let closed = false;
    const { carrier } = harness({ async *readImports() {
      try { for (let i = 0; i < 5; i++) yield await Promise.resolve(opaque(new Uint8Array(2))); }
      finally { closed = true; }
    } });
    for await (const record of carrier.poll([])) { expect(record.size).toBe(2); break; }
    expect(closed).toBe(true);
    await expect(async () => { for await (const record of carrier.poll([])) { expect(record.size).toBe(2); } }).rejects.toMatchObject({ code: 'limit-exceeded' });
    let opened = false;
    const oversized = harness({ async *readImports() {
      yield await Promise.resolve({ size: 1025, async *open() { opened = true; yield await Promise.resolve(new Uint8Array(1)); } });
    } }).carrier;
    await expect(oversized.poll([]).next()).rejects.toMatchObject({ code: 'limit-exceeded' });
    expect(opened).toBe(false);
  });

  it('reports unavailable adapters and keeps repeated/concurrent exports separate', async () => {
    const unavailable = harness({ available: () => Promise.reject(new Error('gone')) }).carrier;
    expect(await unavailable.available()).toBe(false);
    expect(await unavailable.put(opaque(new Uint8Array(1)))).toEqual({ ok: false, error: 'unavailable' });
    const outputs: number[][] = [];
    const carrier = harness({ beginExport: () => {
      const own: number[] = []; outputs.push(own);
      return Promise.resolve({ write: data => { own.push(...data); return Promise.resolve(); },
        commit: () => Promise.resolve(), abort: () => Promise.resolve() });
    } }).carrier;
    const results = await Promise.all([carrier.put(opaque(new Uint8Array([1]))), carrier.put(opaque(new Uint8Array([2])))]);
    expect(results.every(result => result.ok)).toBe(true);
    expect(outputs).toEqual([[1], [2]]);
  });
});

it('propagates source failure and contains abort failure without committing', async () => {
  let closed = false;
  const box: SealedBox = { size: 10, async *open() {
    try { yield await Promise.resolve(new Uint8Array(5)); throw new Error('source failed'); }
    finally { closed = true; }
  } };
  const { carrier, events } = harness();
  expect(await carrier.put(box)).toEqual({ ok: false, error: 'import-failed' });
  expect(events.at(-1)).toBe('abort');
  expect(events).not.toContain('commit');
  expect(closed).toBe(true);
  const failedAbort = harness({ beginExport: () => Promise.resolve({
    write: () => Promise.reject(new Error('write')),
    commit: () => Promise.resolve(), abort: () => Promise.reject(new Error('abort')),
  }) }).carrier;
  expect(await failedAbort.put(opaque(new Uint8Array(1)))).toEqual({ ok: false, error: 'export-failed' });
});

it('captures source size and factory before availability awaits, preserving source method binding', async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const { carrier, output } = harness({ available: async () => { await gate; return true; } });
  const original = { size: 1, marker: 8, async *open() {
    yield await Promise.resolve(new Uint8Array([this.marker]));
  } };
  const pending = carrier.put(original);
  original.size = 10000;
  original.open = async function* () { yield await Promise.resolve(new Uint8Array([0])); };
  release();
  expect((await pending).ok).toBe(true);
  expect(Buffer.concat(output)).toEqual(Buffer.from([8]));
});

it('rejects invalid filters and constructor limits and closes imported byte streams on early break', async () => {
  for (const key of ['maxBoxBytes', 'maxReadBytes', 'maxPollRecords'] as const) {
    expect(() => harness({ [key]: 0 })).toThrow();
  }
  const { carrier } = harness();
  await expect(carrier.poll([new Uint8Array(15)]).next()).rejects.toMatchObject({ code: 'invalid-input' });
  await expect(carrier.poll([], -1).next()).rejects.toMatchObject({ code: 'invalid-input' });
  await expect(carrier.poll(Array.from({ length: 65 }, () => new Uint8Array(16))).next())
    .rejects.toMatchObject({ code: 'limit-exceeded' });
  let closed = false;
  const importing = harness({ async *readImports() {
    yield await Promise.resolve({ size: 2, async *open() {
      try {
        yield await Promise.resolve(new Uint8Array([1]));
        yield await Promise.resolve(new Uint8Array([2]));
      } finally { closed = true; }
    } });
  } }).carrier;
  for await (const record of importing.poll([])) {
    for await (const chunk of record.open()) { expect(chunk).toEqual(new Uint8Array([1])); break; }
  }
  expect(closed).toBe(true);
});

it('exports 5 MiB using frame-sized reads without accumulating whole-file carrier state', async () => {
  const total = 5 * 1024 * 1024;
  const readSize = 16384;
  let observed = 0;
  let writes = 0;
  let largestWrite = 0;
  let committed = false;
  const carrier = harness({ maxBoxBytes: total, maxReadBytes: readSize,
    beginExport: () => Promise.resolve({
      write: chunk => {
        expect(chunk.every(byte => byte === writes % 251)).toBe(true);
        observed += chunk.length; writes++; largestWrite = Math.max(largestWrite, chunk.length);
        return Promise.resolve();
      },
      commit: () => { committed = true; return Promise.resolve(); },
      abort: () => Promise.reject(new Error('Unexpected abort')),
    }) }).carrier;
  const box: SealedBox = { size: total, async *open() {
    for (let index = 0; index < total / readSize; index++) {
      yield await Promise.resolve(new Uint8Array(readSize).fill(index % 251));
    }
  } };
  expect(await carrier.put(box)).toEqual({ ok: true, outcome: 'exported' });
  expect({ observed, writes, largestWrite, committed })
    .toEqual({ observed: total, writes: 320, largestWrite: 16384, committed: true });
});
