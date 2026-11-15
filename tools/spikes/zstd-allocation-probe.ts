interface Runtime {
  HEAPU8: Uint8Array;
  _malloc(bytes: number): number;
  _free(pointer: number): void;
}
interface Codec {
  compress(input: Uint8Array, level: number): Uint8Array;
  decompress(input: Uint8Array, options?: { defaultHeapSize: number }): Uint8Array;
}

/** Run only on an initialized diagnostic module. The guard blocks large allocations. */
export async function measureZstdAllocation() {
  const loaded: unknown = await import(new URL('./compression/zstd/module.js', import.meta.url).href);
  const api: unknown = await import(new URL('./compression/zstd/index.web.js', import.meta.url).href);
  if (!loaded || typeof loaded !== 'object' || !('Module' in loaded)
    || !api || typeof api !== 'object' || !('compress' in api) || !('decompress' in api)) {
    throw new Error('Missing diagnostic runtime');
  }
  const runtime = loaded.Module as Runtime;
  const codec = api as Codec;
  if (!(runtime.HEAPU8 instanceof Uint8Array) || typeof runtime._malloc !== 'function'
    || typeof runtime._free !== 'function' || typeof codec.compress !== 'function'
    || typeof codec.decompress !== 'function') throw new Error('Uninitialized diagnostic runtime');

  // RFC 8878 single-segment header, four-byte content size, final empty raw block.
  // The declared size deliberately disagrees with the empty body.
  const frame = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0xa0, 0, 0, 0, 2, 1, 0, 0]);
  const declaredBytes = 33_554_432;
  const guardLimit = 1_048_576;
  const originalMalloc = runtime._malloc.bind(runtime);
  const originalFree = runtime._free.bind(runtime);
  const requests: number[] = [];
  const freed: number[] = [];
  const live = new Map<number, number>();
  const blocked = new Error('ProbeAllocationLimit');
  const heapBefore = runtime.HEAPU8.byteLength;
  let blockedBytes: number | null = null;
  let retainedBytes: number;
  runtime._malloc = (bytes) => {
    requests.push(bytes);
    if (bytes > guardLimit) {
      blockedBytes = bytes;
      throw blocked;
    }
    const pointer = originalMalloc(bytes);
    live.set(pointer, bytes);
    return pointer;
  };
  runtime._free = (pointer) => {
    freed.push(live.get(pointer) ?? 0);
    live.delete(pointer);
    originalFree(pointer);
  };
  try {
    codec.decompress(frame, { defaultHeapSize: guardLimit });
  } catch (error) {
    if (error !== blocked) throw error;
  } finally {
    retainedBytes = [...live.values()].reduce((sum, bytes) => sum + bytes, 0);
    runtime._malloc = originalMalloc;
    runtime._free = originalFree;
    for (const pointer of live.keys()) originalFree(pointer);
  }
  const control = new Uint8Array([4, 5, 6]);
  const decoded = codec.decompress(codec.compress(control, 3));
  return {
    test: 'D2-ZSTD-ALLOCATION', input_bytes: frame.byteLength,
    frame_hex: Array.from(frame, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    declared_content_bytes: declaredBytes, default_heap_size_option_bytes: guardLimit,
    probe_guard_limit_bytes: guardLimit, requested_allocation_bytes: requests,
    blocked_allocation_bytes: blockedBytes, large_allocation_performed: false,
    freed_bytes_before_probe_cleanup: freed,
    retained_source_bytes_before_probe_cleanup: retainedBytes,
    heap_before_bytes: heapBefore, heap_after_bytes: runtime.HEAPU8.byteLength,
    restored_roundtrip: decoded.length === control.length && decoded.every((byte, index) => byte === control[index]),
  };
}
