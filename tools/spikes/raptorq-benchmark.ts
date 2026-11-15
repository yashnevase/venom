import { encode_packets, RaptorQDecoder } from '@raptorqr/raptorq-wasm';

export type ReceptionPattern = 'ordered' | 'late-drop' | 'duplicates' | 'insufficient';
export interface RaptorqCase {
  inputBytes: number;
  packetBytes: number;
  pattern: ReceptionPattern;
  iterations: number;
}
interface Trial {
  encode_ms: number;
  decode_ms: number;
  generated_packets: number;
  delivered_packets: number;
  skipped_packets: number;
  duplicate_packets: number;
  max_packet_bytes: number;
  decoded_bytes: number | null;
  matched: boolean;
  error: string | null;
}

function fixture(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  let state = 0x53310001;
  for (let index = 0; index < length; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 255;
  }
  return bytes;
}

function samples(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 ? ordered[middle]
    : ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2;
  return { median_ms: median, p95_ms: ordered[Math.ceil(ordered.length * 0.95) - 1], samples_ms: values };
}

function packetsFor(data: Uint8Array, packetBytes: number): Uint8Array[] {
  const encoded: unknown = encode_packets(data, packetBytes, 100);
  const maxPackets = 2 * Math.ceil(data.length / (packetBytes - 4));
  if (!Array.isArray(encoded) || encoded.length === 0 || encoded.length > maxPackets) {
    throw new Error('InvalidPacketCount');
  }
  return (encoded as unknown[]).map((packet) => {
    if (!(packet instanceof Uint8Array) || packet.length < 4 || packet.length > packetBytes) {
      throw new Error('InvalidPacketBytes');
    }
    return new Uint8Array(packet);
  });
}

function receivedPackets(packets: Uint8Array[], config: RaptorqCase) {
  if (config.pattern === 'insufficient') {
    return packets.slice(0, Math.floor(Math.ceil(config.inputBytes / (config.packetBytes - 4)) / 2))
      .map((packet) => ({ packet, duplicate: false }));
  }
  if (config.pattern === 'late-drop') {
    return packets.slice(Math.floor(packets.length / 4)).filter((_, index) => index % 5 !== 0)
      .reverse().map((packet) => ({ packet, duplicate: false }));
  }
  if (config.pattern === 'duplicates') {
    return packets.flatMap((packet) => [{ packet, duplicate: false }, { packet, duplicate: true }]);
  }
  return packets.map((packet) => ({ packet, duplicate: false }));
}

export function runRaptorqCase(config: RaptorqCase) {
  if (!Number.isSafeInteger(config.inputBytes) || config.inputBytes < 1 || config.inputBytes > 1_048_576
    || !Number.isSafeInteger(config.packetBytes) || config.packetBytes < 128 || config.packetBytes > 16_384
    || !Number.isSafeInteger(config.iterations) || config.iterations < 1 || config.iterations > 16
    || !['ordered', 'late-drop', 'duplicates', 'insufficient'].includes(config.pattern)) {
    throw new RangeError('Invalid diagnostic input');
  }
  const data = fixture(config.inputBytes);
  const trials: Trial[] = [];
  for (let iteration = 0; iteration < config.iterations; iteration++) {
    const trial: Trial = { encode_ms: 0, decode_ms: 0, generated_packets: 0, delivered_packets: 0,
      skipped_packets: 0, duplicate_packets: 0, max_packet_bytes: 0,
      decoded_bytes: null, matched: false, error: null };
    try {
      const encodeStart = performance.now();
      const packets = packetsFor(data, config.packetBytes);
      trial.encode_ms = performance.now() - encodeStart;
      trial.generated_packets = packets.length;
      trial.max_packet_bytes = Math.max(...packets.map((packet) => packet.length));
      const received = receivedPackets(packets, config);
      trial.skipped_packets = packets.length - received.filter((entry) => !entry.duplicate).length;
      let decoded: Uint8Array | null = null;
      let decoder: RaptorQDecoder | undefined;
      const decodeStart = performance.now();
      try {
        decoder = new RaptorQDecoder(data.length, config.packetBytes);
        for (const { packet, duplicate } of received) {
          trial.delivered_packets++;
          trial.duplicate_packets += Number(duplicate);
          const value: unknown = decoder.push(packet);
          if (value === null || value === undefined) continue;
          if (!(value instanceof Uint8Array)) throw new Error('InvalidDecoderOutput');
          decoded = new Uint8Array(value);
          break;
        }
      } finally {
        decoder?.free();
        trial.decode_ms = performance.now() - decodeStart;
      }
      trial.decoded_bytes = decoded?.length ?? null;
      trial.matched = decoded !== null && decoded.length === data.length
        && decoded.every((byte, index) => byte === data[index]);
      if (decoded && !trial.matched) trial.error = 'FixtureMismatch';
    } catch (error) {
      trial.error = error instanceof Error ? error.name + ' ' + error.message
        : typeof error === 'string' ? error.slice(0, 160) : 'UnknownError';
    }
    trials.push(trial);
  }
  const completed = trials.filter((trial) => trial.matched).length;
  return { input_bytes: config.inputBytes, packet_bytes: config.packetBytes,
    symbol_bytes: config.packetBytes - 4, repair_percent: 100, pattern: config.pattern,
    iterations: config.iterations, completed_trials: completed,
    outcome: completed === trials.length ? 'verified' : trials.some((trial) => trial.error) ? 'failed' : 'incomplete',
    encode: samples(trials.map((trial) => trial.encode_ms)),
    decode: samples(trials.map((trial) => trial.decode_ms)), trials };
}
