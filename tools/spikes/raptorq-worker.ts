import init from '@raptorqr/raptorq-wasm';
import { runRaptorqCase } from './raptorq-benchmark.js';

const post = (data: unknown) => {
  (globalThis as unknown as { postMessage(data: unknown): void }).postMessage(data);
};
const started = performance.now();
let busy = false;

try {
  const wasm = await init({ module_or_path: new URL('./codec/wasm/raptorqr_raptorq_wasm_bg.wasm', import.meta.url) });
  const initializationMs = performance.now() - started;
  post({ v: 1, type: 'ready', initialization_ms: initializationMs, wasm_heap_bytes: wasm.memory.buffer.byteLength });
  globalThis.addEventListener('message', (event: MessageEvent<unknown>) => {
    const command = event.data;
    if (!command || typeof command !== 'object' || !('v' in command) || command.v !== 1
      || !('type' in command) || command.type !== 'run' || busy) return;
    busy = true;
    void (async () => {
      const heapBefore = wasm.memory.buffer.byteLength;
      const cases = [];
      for (const inputBytes of [200 * 1024, 1024 * 1024]) {
        for (const packetBytes of [512, 1024, 1280]) {
          for (const pattern of ['ordered', 'late-drop', 'duplicates'] as const) {
            cases.push(runRaptorqCase({ inputBytes, packetBytes, pattern, iterations: 8 }));
            post({ v: 1, type: 'progress', completed_cases: cases.length });
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      }
      post({ v: 1, type: 'complete', outcome: cases.every((row) => row.outcome === 'verified') ? 'verified' : 'failed',
        initialization_ms: initializationMs, heap_before_bytes: heapBefore,
        heap_after_bytes: wasm.memory.buffer.byteLength, cases });
    })().catch((error: unknown) => {
      post({ v: 1, type: 'failed', error: error instanceof Error ? error.name : 'UnknownError' });
    }).finally(() => { busy = false; });
  });
} catch (error) {
  post({ v: 1, type: 'initialization-failed', error: error instanceof Error ? error.name : 'UnknownError' });
}
