// S-2 diagnostic only. Full SDP JSON is debug data, separate from protocol boxes.
const local = document.querySelector<HTMLTextAreaElement>('#local');
const remote = document.querySelector<HTMLTextAreaElement>('#remote');
const device = document.querySelector<HTMLInputElement>('#device');
const status = document.querySelector<HTMLElement>('[role="status"]');
const output = document.querySelector<HTMLElement>('#report');
if (!local || !remote || !device || !status || !output) throw new Error('Missing probe fields');
const fields = { local, remote, device, status, output };

interface Report {
  test: 'S-2';
  role: 'offer' | 'answer';
  started_at: string;
  user_agent: string;
  secure_context: boolean;
  ice_servers: number;
  device_notes: string;
  outcome: 'pending' | 'verified' | 'failed' | 'timeout';
  diagnostic_bytes: number;
  elapsed_ms?: number;
  under_30_seconds?: boolean;
  events: { elapsed_ms: number; state: string }[];
}

let peer: RTCPeerConnection | undefined;
let report: Report | undefined;
let started = 0;
let deadline: number | undefined;
const payload = Uint8Array.from({ length: 4096 }, (_, index) => index % 251);

function refresh(message: string): void {
  fields.status.textContent = message;
  if (report) {
    report.device_notes = fields.device.value.slice(0, 1024);
    fields.output.textContent = JSON.stringify(report, null, 2);
  }
}

function record(state: string): void {
  if (report && report.events.length < 128) {
    report.events.push({ elapsed_ms: Math.round(performance.now() - started), state });
  }
}

function closePeer(): void {
  clearTimeout(deadline);
  peer?.close();
  peer = undefined;
}

function attachChannel(connection: RTCPeerConnection, channel: RTCDataChannel, initiator: boolean): void {
  channel.binaryType = 'arraybuffer';
  channel.onopen = () => {
    if (peer !== connection) return;
    record('datachannel-open');
    if (initiator) channel.send(payload);
  };
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (peer !== connection || !report || report.outcome !== 'pending') return;
    const data = event.data;
    if (!(data instanceof ArrayBuffer) || data.byteLength !== payload.byteLength
      || !new Uint8Array(data).every((byte, index) => byte === payload[index])) {
      report.outcome = 'failed';
      closePeer();
      refresh('Invalid diagnostic data');
      return;
    }
    if (!initiator) channel.send(data);
    clearTimeout(deadline);
    report.outcome = 'verified';
    report.diagnostic_bytes = data.byteLength;
    report.elapsed_ms = Math.round(performance.now() - started);
    report.under_30_seconds = report.elapsed_ms < 30_000;
    record('diagnostic-verified');
    refresh('Verified 4096 diagnostic bytes');
  };
  channel.onclose = () => {
    if (peer !== connection) return;
    clearTimeout(deadline);
    record('datachannel-closed');
    refresh('Closed');
  };
  channel.onerror = () => {
    if (peer !== connection || !report) return;
    record('datachannel-error');
    const completed = report.outcome === 'verified';
    if (!completed) report.outcome = 'failed';
    closePeer();
    refresh(completed ? 'Closed' : 'Data channel error');
  };
}

function createPeer(initiator: boolean): RTCPeerConnection {
  closePeer();
  started = performance.now();
  report = {
    test: 'S-2', role: initiator ? 'offer' : 'answer', started_at: new Date().toISOString(),
    user_agent: navigator.userAgent, secure_context: window.isSecureContext,
    ice_servers: 0, device_notes: '', outcome: 'pending', diagnostic_bytes: 0, events: [],
  };
  fields.local.value = '';
  const connection = new RTCPeerConnection({ iceServers: [] });
  peer = connection;
  connection.oniceconnectionstatechange = () => {
    if (peer !== connection) return;
    record(`ice-${connection.iceConnectionState}`);
    refresh(fields.status.textContent);
  };
  connection.onconnectionstatechange = () => {
    if (peer !== connection) return;
    record(connection.connectionState);
    if (connection.connectionState === 'failed') {
      refresh('Connection failed');
    }
  };
  connection.ondatachannel = (event) => { attachChannel(connection, event.channel, false); };
  refresh('Waiting for a path');
  return connection;
}

function startConnectionDeadline(connection: RTCPeerConnection): void {
  clearTimeout(deadline);
  deadline = window.setTimeout(() => {
    if (peer !== connection || !report) return;
    report.outcome = connection.connectionState === 'failed' ? 'failed' : 'timeout';
    record('timeout');
    closePeer();
    refresh('Connection timed out');
  }, 120_000);
}

async function exposeHandshake(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState !== 'complete') {
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timeout);
        connection.removeEventListener('icegatheringstatechange', changed);
      };
      const changed = (): void => {
        if (connection.iceGatheringState === 'complete') { cleanup(); resolve(); }
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('ICE gathering timeout'));
      }, 10_000);
      connection.addEventListener('icegatheringstatechange', changed);
      changed();
    });
  }
  if (peer !== connection || !connection.localDescription) return;
  const { type, sdp } = connection.localDescription;
  fields.local.value = JSON.stringify({ v: 1, type, sdp });
  record('local-handshake-ready');
  refresh('Waiting for a path');
}

function parseHandshake(type: 'offer' | 'answer'): RTCSessionDescriptionInit | undefined {
  try {
    const text = fields.remote.value;
    if (text.length > 65_536) throw new Error('Oversized handshake');
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null) throw new Error('Invalid record');
    const record = data as Record<string, unknown>;
    if (record.v !== 1 || record.type !== type || typeof record.sdp !== 'string'
      || !record.sdp.startsWith('v=0\r\n')) throw new Error('Invalid fields');
    return { type, sdp: record.sdp };
  } catch {
    refresh('Invalid handshake');
    return undefined;
  }
}

async function createOffer(): Promise<void> {
  const connection = createPeer(true);
  attachChannel(connection, connection.createDataChannel('s2-diagnostic'), true);
  await connection.setLocalDescription(await connection.createOffer());
  await exposeHandshake(connection);
}

async function createAnswer(): Promise<void> {
  const offer = parseHandshake('offer');
  if (!offer) return;
  const connection = createPeer(false);
  await connection.setRemoteDescription(offer);
  await connection.setLocalDescription(await connection.createAnswer());
  await exposeHandshake(connection);
  if (peer === connection) startConnectionDeadline(connection);
}

async function applyAnswer(): Promise<void> {
  const answer = parseHandshake('answer');
  if (!answer) return;
  if (!peer || report?.role !== 'offer') { refresh('Create an offer first'); return; }
  startConnectionDeadline(peer);
  await peer.setRemoteDescription(answer);
}

function bind(id: string, action: () => Promise<void>): void {
  const button = document.querySelector<HTMLButtonElement>(`#${id}`);
  if (!button) throw new Error('Missing probe button');
  button.onclick = () => {
    button.disabled = true;
    void action().catch(() => {
      if (report) report.outcome = 'failed';
      closePeer();
      refresh('Connection setup failed');
    }).finally(() => { button.disabled = false; });
  };
}

bind('offer', createOffer);
bind('answer', createAnswer);
bind('apply', applyAnswer);
bind('close', () => {
  record('manual-close');
  closePeer();
  refresh('Closed');
  return Promise.resolve();
});
bind('save', () => {
  if (!report) { refresh('Run the experiment first'); return Promise.resolve(); }
  refresh(fields.status.textContent);
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `s2-${report.role}-${Date.now().toString()}.json`;
  link.click();
  window.setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
  return Promise.resolve();
});
