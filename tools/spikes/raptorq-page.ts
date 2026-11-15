export {};

const run = document.querySelector<HTMLButtonElement>('#run');
const select = document.querySelector<HTMLButtonElement>('#select');
const notes = document.querySelector<HTMLInputElement>('#notes');
const output = document.querySelector<HTMLTextAreaElement>('#report');
const status = document.querySelector<HTMLElement>('[role="status"]');
if (!run || !select || !notes || !output || !status) throw new Error('Missing diagnostic control');
const reportBox = output;
const state = status;
let deadline: number | undefined;
let build: unknown;
let worker: Worker | undefined;
let initialized = false;

function stop(outcome: string, error?: string): void {
  if (deadline !== undefined) clearTimeout(deadline);
  worker?.terminate();
  worker = undefined;
  run?.setAttribute('disabled', '');
  state.textContent = outcome === 'timed-out' ? 'Timed out' : 'Unavailable';
  reportBox.value = JSON.stringify({ probe: 'S-1-codec', v: 1, outcome, error,
    user_agent: navigator.userAgent, secure_context: isSecureContext,
    device_notes: notes?.value ?? '', build }, null, 2);
}

try {
  const response = await fetch('./dist/raptorq/build.json');
  if (!response.ok) throw new Error('MissingBuildMetadata');
  build = await response.json() as unknown;
  worker = new Worker('./dist/raptorq/raptorq-worker.js', { type: 'module' });
  const activeWorker = worker;
  deadline = window.setTimeout(() => { stop('initialization-failed', 'InitializationDeadline'); }, 15_000);
  worker.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (worker !== activeWorker) return;
    const message = event.data;
    if (!message || typeof message !== 'object' || !('v' in message) || message.v !== 1 || !('type' in message)) return;
    if (message.type === 'ready') {
      clearTimeout(deadline);
      initialized = true;
      run.disabled = false;
      state.textContent = 'Ready';
    } else if (message.type === 'progress' && 'completed_cases' in message) {
      state.textContent = `Running ${String(message.completed_cases)} of 18`;
    } else if (message.type === 'complete') {
      clearTimeout(deadline);
      reportBox.value = JSON.stringify({ ...message, probe: 'S-1-codec', v: 1, measured_at: new Date().toISOString(),
        user_agent: navigator.userAgent, secure_context: isSecureContext, device_notes: notes.value,
        build }, null, 2);
      state.textContent = 'Complete';
      run.disabled = false;
    } else if (message.type === 'initialization-failed') {
      stop('initialization-failed', 'WorkerInitializationFailed');
    } else if (message.type === 'failed') {
      stop('failed', 'WorkerRunFailed');
    }
  });
  worker.addEventListener('error', () => {
    if (worker === activeWorker) stop(initialized ? 'failed' : 'initialization-failed', 'WorkerError');
  });
  run.addEventListener('click', () => {
    run.disabled = true;
    state.textContent = 'Running';
    deadline = window.setTimeout(() => { stop('timed-out', 'ExecutionDeadline'); }, 120_000);
    activeWorker.postMessage({ v: 1, type: 'run' });
  });
} catch (error) {
  stop('initialization-failed', error instanceof Error ? error.name : 'UnknownError');
}
select.addEventListener('click', () => { reportBox.focus(); reportBox.select(); });
