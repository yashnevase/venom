interface Limits { maxInputBytes: number; maxOutputBytes: number }
type Result = { ok: true; value: Uint8Array } | { ok: false; error: string };
interface Codec {
  compress(input: Uint8Array, limits: Limits): Promise<Result>;
  decompress(input: Uint8Array, limits: Limits): Promise<Result>;
}
interface Comparison {
  codec: Codec;
  stats: { import_ms: number; init_ms: number; heap_before_bytes: number };
  heapBytes(): number;
}

async function loadZstd(): Promise<Comparison> {
  const started = performance.now();
  const loaded: unknown = await import(new URL('./compression/zstd/index.web.js', import.meta.url).href);
  const imported = performance.now();
  if (!loaded || typeof loaded !== 'object'
    || ['init', 'compress', 'decompress'].some((key) => typeof (loaded as Record<string, unknown>)[key] !== 'function')) {
    throw new Error('zstd-module-unavailable');
  }
  const zstd = loaded as { init(path: string): Promise<void>; compress(input: Uint8Array, level: number): Uint8Array;
    decompress(input: Uint8Array): Uint8Array };
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      zstd.init(new URL('./compression/zstd/zstd.wasm', import.meta.url).href),
      new Promise<never>((_resolve, reject) => { deadline = setTimeout(() => { reject(new Error('zstd-init-timeout')); }, 15000); }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
  const initialized = performance.now();
  const runtime: unknown = await import(new URL('./compression/zstd/module.js', import.meta.url).href);
  const state = runtime as { Module: { HEAP8: Int8Array } };
  if (!(state.Module.HEAP8 instanceof Int8Array)) throw new Error('zstd-memory-unavailable');
  const heapBytes = () => state.Module.HEAP8.byteLength;
  return { codec: {
    compress: (input) => Promise.resolve({ ok: true, value: zstd.compress(input, 3) }),
    decompress: (input) => Promise.resolve({ ok: true, value: zstd.decompress(input) }),
  }, stats: { import_ms: imported - started, init_ms: initialized - imported, heap_before_bytes: heapBytes() }, heapBytes };
}

function element<K extends keyof HTMLElementTagNameMap>(id: string, tag: K): HTMLElementTagNameMap[K] {
  const found = document.getElementById(id);
  if (!found || found.tagName.toLowerCase() !== tag) throw new Error('Missing diagnostic control');
  return found as HTMLElementTagNameMap[K];
}
const run = element('run', 'button');
const status = element('status', 'p');
const report = element('report', 'textarea');
const notes = element('notes', 'input');
const limits = { maxInputBytes: 1024 * 1024, maxOutputBytes: 1024 * 1024 };
const pause = () => new Promise<void>((resolve) => requestAnimationFrame(() => { resolve(); }));

function unwrap(result: Result): Uint8Array {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function equal(first: Uint8Array, second: Uint8Array): boolean {
  return first.length === second.length && first.every((byte, index) => byte === second[index]);
}
function summarize(samples: number[]) {
  const sorted = [...samples].sort((first, second) => first - second);
  return { iterations: samples.length, median_ms: ((sorted[7] ?? 0) + (sorted[8] ?? 0)) / 2,
    p95_ms: sorted[15], samples_ms: samples };
}
function formats() {
  return Object.fromEntries(['deflate', 'zstd'].map((format) => {
    try {
      new CompressionStream(format as CompressionFormat);
      new DecompressionStream(format as CompressionFormat);
      return [format, 'available'];
    } catch (error) {
      return [format, error instanceof Error ? error.name : 'unavailable'];
    }
  }));
}

async function initialize() {
  const url = new URL('./compression/compression.js', import.meta.url).href;
  const [module, buildResponse] = await Promise.all([
    import(url) as Promise<unknown>, fetch(new URL('./compression/build.json', import.meta.url)),
  ]);
  if (!module || typeof module !== 'object'
    || typeof (module as Record<string, unknown>).compressDeflate !== 'function'
    || typeof (module as Record<string, unknown>).decompressDeflate !== 'function' || !buildResponse.ok) {
    throw new Error('Diagnostic module unavailable');
  }
  const core = module as { compressDeflate: Codec['compress']; decompressDeflate: Codec['decompress'] };
  const codec: Codec = { compress: core.compressDeflate, decompress: core.decompressDeflate };
  const build: unknown = await buildResponse.json();
  const comparison = document.documentElement.dataset.comparison === 'zstd' ? await loadZstd() : undefined;
  run.disabled = false;
  status.textContent = 'Ready';
  run.addEventListener('click', () => {
    void benchmark(codec, build, comparison);
  });
}

async function benchmark(codec: Codec, build: unknown, comparison?: Comparison) {
  run.disabled = true;
  const heapBefore = comparison?.heapBytes();
  const base = { probe: comparison ? 'D-2-comparison' : 'D-2-deflate', v: 1, started_at: new Date().toISOString(),
    user_agent: navigator.userAgent, secure_context: isSecureContext, device_notes: notes.value,
    build, native_formats: formats(), limits, decoder_execution: 'synchronous' };
  try {
    let state = 0x44460003;
    const fixtures = [
      { id: 'chat-1KiB', input: new TextEncoder().encode('OpenMesh message. '.repeat(64)).subarray(0, 1024) },
      { id: 'repeated-256KiB', input: new Uint8Array(262144).fill(42) },
      { id: 'random-256KiB', input: Uint8Array.from({ length: 262144 }, () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state >>> 24;
      }) },
    ];
    const measurements = [];
    let rejectionInput: Uint8Array | undefined;
    const engines = [{ id: 'deflate', codec }, ...(comparison ? [{ id: 'zstd', codec: comparison.codec }] : [])];
    for (const engine of engines) {
      for (const fixture of fixtures) {
        let compressed = new Uint8Array();
        for (const operation of ['compress', 'decompress']) {
          const samples = [];
          status.textContent = `${engine.id} ${fixture.id} — ${operation}`;
          for (let trial = 0; trial < 16; trial += 1) {
            await pause();
            const started = performance.now();
            const result = operation === 'compress'
              ? await engine.codec.compress(fixture.input, limits)
              : await engine.codec.decompress(compressed, limits);
            samples.push(performance.now() - started);
            const output = unwrap(result);
            if (operation === 'compress') compressed = new Uint8Array(output);
            else if (!equal(output, fixture.input)) throw new Error('roundtrip-mismatch');
          }
          measurements.push({ algorithm: engine.id, fixture: fixture.id, input_bytes: fixture.input.length,
            compressed_bytes: compressed.length, operation, ...summarize(samples) });
        }
        if (engine.id === 'deflate' && fixture.id === 'repeated-256KiB') rejectionInput = compressed;
      }
    }
    if (!rejectionInput) throw new Error('Missing expansion fixture');
    const rejection = await codec.decompress(rejectionInput,
      { maxInputBytes: rejectionInput.length, maxOutputBytes: 16384 });
    if (rejection.ok || rejection.error !== 'limit-exceeded') throw new Error('expansion-limit-failed');
    report.value = JSON.stringify({ ...base, outcome: 'verified', measurements,
      zstd: comparison ? { ...comparison.stats, level: 3, heap_before_bytes: heapBefore, heap_after_bytes: comparison.heapBytes(),
        input_scope: 'fixed-public-fixtures' } : undefined,
      expansion_rejection: { expanded_bytes: 262144, max_output_bytes: 16384, outcome: rejection.error } }, null, 2);
    status.textContent = 'Complete';
  } catch (error) {
    report.value = JSON.stringify({ ...base, outcome: 'failed', error: error instanceof Error ? error.message : 'unknown' }, null, 2);
    status.textContent = 'Failed';
  } finally {
    run.disabled = false;
  }
}

element('select', 'button').addEventListener('click', () => { report.focus(); report.select(); });
void initialize().catch((error: unknown) => {
  status.textContent = 'Failed';
  report.value = JSON.stringify({ outcome: 'failed', error: error instanceof Error ? error.message : 'load-failed' });
});
