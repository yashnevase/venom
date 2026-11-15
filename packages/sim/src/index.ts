/** S-6 metadata-only experiment. Rates and time slots are model inputs. */
export interface SwarmConfig {
  seed: number;
  clients: number;
  fileBytes: number;
  chunkBytes: number;
  tickMs: number;
  latencyMs: number;
  durationMs: number;
  seedBytesPerSecond: number;
  peerBytesPerSecond: number;
  downloadBytesPerSecond: number;
  peerDegree: number;
  mode: 'swarm' | 'web-seed-only';
  churnPeriodMs: number;
  offlineMs: number;
  lossRate: number;
  blockedPeerRate: number;
  leaveAfterCompleteMs: number | null;
  stopPeerPathsAtMs: number | null;
}

export interface SwarmResult {
  seed: number;
  completed: number;
  completionMs: (number | null)[];
  receivedChunks: number[];
  simulatedMs: number;
  seedBytes: number;
  peerBytes: number;
  receivedBytes: number;
  duplicateBytes: number;
  droppedBytes: number;
  inFlightBytes: number;
  peakInFlight: number;
  peakSeedBytesPerTick: number;
  peakPeerBytesPerTick: number;
  peakDownloadBytesPerTick: number;
  neighbors: number[][];
}

interface Client {
  id: number;
  held: Uint8Array;
  pending: Uint8Array;
  remaining: number;
  completedMs: number | null;
  phase: number;
  online: boolean;
  neighbors: Client[];
  uploadSlots: number;
  downloadSlots: number;
  sentThisTick: number;
  requestedThisTick: number;
}

interface Flight { sender: Client | null; receiver: Client; chunk: number; bytes: number }
interface Candidate { chunk: number; rarity: number }

const MAX_CELLS = 1_048_576;
const MAX_FLIGHTS = 65_536;

function integer(value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid simulation input');
}

function serviceSlots(rate: number, config: SwarmConfig, max: number): number {
  integer(rate, 0, Number.MAX_SAFE_INTEGER);
  const slots = rate / config.chunkBytes * config.tickMs / 1000;
  integer(slots, 0, max);
  return slots;
}

function validate(config: SwarmConfig): void {
  integer(config.seed, 1, 0xffff_ffff);
  integer(config.clients, 1, 1000);
  integer(config.fileBytes, 1, Number.MAX_SAFE_INTEGER);
  if (![65_536, 262_144, 1_048_576].includes(config.chunkBytes)) throw new RangeError('Invalid chunk size');
  integer(Math.ceil(config.fileBytes / config.chunkBytes) * config.clients, 1, MAX_CELLS);
  integer(config.tickMs, 25, 1000);
  integer(config.latencyMs, 0, 10_000);
  integer(config.durationMs / config.tickMs, 1, 20_000);
  integer(config.churnPeriodMs / config.tickMs, 1, 20_000);
  integer(config.offlineMs / config.tickMs, 0, config.churnPeriodMs / config.tickMs - 1);
  if (![0, 2, 4, 6, 8].includes(config.peerDegree)) throw new RangeError('Invalid neighborhood degree');
  if (!['swarm', 'web-seed-only'].includes(config.mode)) throw new RangeError('Invalid simulation mode');
  for (const rate of [config.lossRate, config.blockedPeerRate]) {
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new RangeError('Invalid probability');
  }
  for (const time of [config.leaveAfterCompleteMs, config.stopPeerPathsAtMs]) {
    if (time !== null) integer(time / config.tickMs, 0, 20_000);
  }
  serviceSlots(config.seedBytesPerSecond, config, 1024);
  serviceSlots(config.peerBytesPerSecond, config, 128);
  serviceSlots(config.downloadBytesPerSecond, config, 128);
}

/** Fixed xorshift32 for replayable experiments, with zero seeds rejected. */
function randomSource(seed: number): () => number {
  let state = seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    const first = result[index];
    const second = result[other];
    if (first === undefined || second === undefined) throw new Error('Invalid shuffle index');
    result[index] = second;
    result[other] = first;
  }
  return result;
}

function connect(clients: Client[], degree: number, blockedRate: number, random: () => number): void {
  const links = clients.map(() => new Set<Client>());
  for (let cycle = 0; cycle < degree / 2; cycle++) {
    const order = shuffle(clients, random);
    for (const [index, client] of order.entries()) {
      const next = order[(index + 1) % order.length];
      if (!next || next === client) continue;
      links[client.id]?.add(next);
      links[next.id]?.add(client);
    }
  }
  for (const client of clients) {
    for (const peer of links[client.id] ?? []) {
      if (peer.id > client.id && random() < blockedRate) {
        links[client.id]?.delete(peer);
        links[peer.id]?.delete(client);
      }
    }
    client.neighbors = [...(links[client.id] ?? [])];
  }
}

/** Local availability only. Ties use a seeded rotating chunk start. */
function candidates(client: Client, seedAvailable: boolean, peers: Client[], random: () => number): Candidate[] {
  const result: Candidate[] = [];
  const count = client.held.length;
  const start = Math.floor(random() * count);
  for (let offset = 0; offset < count; offset++) {
    const chunk = (start + offset) % count;
    if (client.held[chunk] || client.pending[chunk]) continue;
    let rarity = 0;
    let available = seedAvailable;
    for (const peer of peers) {
      if (!peer.held[chunk]) continue;
      rarity++;
      available ||= peer.uploadSlots > 0;
    }
    if (available) result.push({ chunk, rarity });
  }
  // Stable sorting preserves seeded tie order for larger neighborhoods.
  if (client.neighbors.length > 4) result.sort((a, b) => a.rarity - b.rarity);
  else result.sort((a, b) => a.chunk - b.chunk);
  return result;
}

export function simulateSwarm(config: SwarmConfig): SwarmResult {
  validate(config);
  const random = randomSource(config.seed);
  const chunkCount = Math.ceil(config.fileBytes / config.chunkBytes);
  const periodTicks = config.churnPeriodMs / config.tickMs;
  const clients: Client[] = Array.from({ length: config.clients }, (_, id) => ({
    id, held: new Uint8Array(chunkCount), pending: new Uint8Array(chunkCount),
    remaining: chunkCount, completedMs: null, phase: Math.floor(random() * periodTicks),
    online: true, neighbors: [], uploadSlots: 0, downloadSlots: 0,
    sentThisTick: 0, requestedThisTick: 0,
  }));
  connect(clients, config.peerDegree, config.blockedPeerRate, random);
  const delayTicks = 1 + Math.ceil(config.latencyMs / config.tickMs);
  const flights: Flight[][] = Array.from({ length: delayTicks + 1 }, () => []);
  const seedSlots = serviceSlots(config.seedBytesPerSecond, config, 1024);
  const peerSlots = serviceSlots(config.peerBytesPerSecond, config, 128);
  const downloadSlots = serviceSlots(config.downloadBytesPerSecond, config, 128);
  let queued = 0;
  const result: SwarmResult = {
    seed: config.seed, completed: 0, completionMs: [], receivedChunks: [], simulatedMs: 0,
    seedBytes: 0, peerBytes: 0, receivedBytes: 0, duplicateBytes: 0, droppedBytes: 0, inFlightBytes: 0,
    peakInFlight: 0, peakSeedBytesPerTick: 0, peakPeerBytesPerTick: 0,
    peakDownloadBytesPerTick: 0, neighbors: clients.map((client) => client.neighbors.map((peer) => peer.id)),
  };
  const finalTick = config.durationMs / config.tickMs;
  for (let tick = 0; tick <= finalTick; tick++) {
    const now = tick * config.tickMs;
    result.simulatedMs = now;
    const peerPaths = config.mode === 'swarm'
      && (config.stopPeerPathsAtMs === null || now < config.stopPeerPathsAtMs);
    for (const client of clients) {
      const retained = client.completedMs === null || config.leaveAfterCompleteMs === null
        || now < client.completedMs + config.leaveAfterCompleteMs;
      client.online = retained && (tick + client.phase) % periodTicks >= config.offlineMs / config.tickMs;
      client.uploadSlots = peerSlots;
      client.downloadSlots = downloadSlots;
      client.sentThisTick = 0;
      client.requestedThisTick = 0;
    }
    const due = tick % flights.length;
    const arriving = flights[due] ?? [];
    flights[due] = [];
    for (const flight of arriving) {
      queued--;
      flight.receiver.pending[flight.chunk] = (flight.receiver.pending[flight.chunk] ?? 1) - 1;
      const reachable = flight.receiver.online && (flight.sender === null || (peerPaths && flight.sender.online));
      if (!reachable || random() < config.lossRate) {
        result.droppedBytes += flight.bytes;
        continue;
      }
      if (flight.receiver.held[flight.chunk]) {
        result.duplicateBytes += flight.bytes;
        continue;
      }
      flight.receiver.held[flight.chunk] = 1;
      flight.receiver.remaining--;
      result.receivedBytes += flight.bytes;
      if (flight.receiver.remaining === 0) {
        flight.receiver.completedMs = now;
        result.completed++;
      }
    }
    if (result.completed === config.clients || tick === finalTick) break;

    let seedRemaining = seedSlots;
    let seedSent = 0;
    const destination = flights[(tick + delayTicks) % flights.length];
    if (!destination) throw new Error('Missing delivery bucket');
    for (const receiver of shuffle(clients, random)) {
      if (!receiver.online || receiver.remaining === 0 || receiver.downloadSlots === 0) continue;
      const peers = peerPaths ? receiver.neighbors.filter((peer) => peer.online) : [];
      if (seedRemaining === 0 && !peers.some((peer) => peer.uploadSlots > 0)) continue;
      const choices = candidates(receiver, seedRemaining > 0, peers, random);
      for (const { chunk } of choices) {
        if (receiver.downloadSlots === 0 || queued === MAX_FLIGHTS) break;
        const availablePeers = peers.filter((peer) => peer.uploadSlots > 0 && peer.held[chunk]);
        const sourceCount = availablePeers.length + Number(seedRemaining > 0);
        if (sourceCount === 0) continue;
        // Fair seeded source choice avoids repeatedly selecting one flapping path.
        const sender = availablePeers[Math.floor(random() * sourceCount)];
        const bytes = Math.min(config.chunkBytes, config.fileBytes - chunk * config.chunkBytes);
        const sources: (Client | null)[] = [sender ?? null];
        // T7 endgame experiment, capped at two sources for the final missing chunk.
        if (sender && receiver.remaining === 1 && seedRemaining > 0 && receiver.downloadSlots > 1) sources.push(null);
        for (const source of sources) {
          if (queued === MAX_FLIGHTS) break;
          if (source) {
            source.uploadSlots--;
            source.sentThisTick += bytes;
            result.peerBytes += bytes;
          } else {
            seedRemaining--;
            seedSent += bytes;
            result.seedBytes += bytes;
          }
          receiver.downloadSlots--;
          receiver.requestedThisTick += bytes;
          receiver.pending[chunk] = (receiver.pending[chunk] ?? 0) + 1;
          destination.push({ sender: source, receiver, chunk, bytes });
          queued++;
        }
      }
    }
    result.peakInFlight = Math.max(result.peakInFlight, queued);
    result.peakSeedBytesPerTick = Math.max(result.peakSeedBytesPerTick, seedSent);
    for (const client of clients) {
      result.peakPeerBytesPerTick = Math.max(result.peakPeerBytesPerTick, client.sentThisTick);
      result.peakDownloadBytesPerTick = Math.max(result.peakDownloadBytesPerTick, client.requestedThisTick);
    }
  }
  result.completionMs = clients.map((client) => client.completedMs);
  result.receivedChunks = clients.map((client) => chunkCount - client.remaining);
  result.inFlightBytes = flights.flat().reduce((total, flight) => total + flight.bytes, 0);
  return result;
}
