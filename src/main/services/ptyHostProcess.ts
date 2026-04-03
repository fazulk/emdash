import { Terminal as HeadlessTerminal } from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';
import * as ptyModule from 'node-pty';
import type { IPty } from 'node-pty';
import type {
  PtyHostEvent,
  PtyHostLayoutState,
  PtyHostMessage,
  PtyHostRequest,
  PtyHostResponse,
  PtyHostReviveLaunch,
  PtyReplayState,
  SerializedPtyHostState,
} from './ptyHostProtocol';
import type { PersistentPtyLaunchRequest, PtySpawnPlan } from './ptyLaunch';
import { waitForShellPrompt, type PromptWaitHandle } from '../utils/waitForShellPrompt';

const LONG_DETACH_GRACE_MS = 3 * 60 * 60 * 1000;
const SHORT_DETACH_GRACE_MS = 30_000;
const DEFAULT_SCROLLBACK = 100_000;
const MIN_PTY_COLS = 2;
const MIN_PTY_ROWS = 1;

type ParentPortLike = {
  on: (event: 'message', listener: (message: unknown) => void) => void;
  postMessage: (message: PtyHostMessage) => void;
};

type PtyHostResult = Extract<PtyHostResponse, { ok: true }>['result'];

type HostRecord = {
  id: string;
  kind: 'local' | 'ssh';
  proc: IPty;
  cols: number;
  rows: number;
  attachedCount: number;
  spawn: PtySpawnPlan;
  persistentRequest: PersistentPtyLaunchRequest;
  fallback?: {
    spawn: PtySpawnPlan;
    persistentRequest: PersistentPtyLaunchRequest;
    emitStarted?: boolean;
  };
  replayTerminal: HeadlessTerminal;
  serializeAddon: SerializeAddon;
  graceTimer: NodeJS.Timeout | null;
  promptHandle: PromptWaitHandle | null;
  closing: boolean;
  persist: boolean;
};

const parentPort = (process as NodeJS.Process & { parentPort?: ParentPortLike }).parentPort;
if (!parentPort) {
  throw new Error('PTY host must be launched as an Electron utility process');
}

const records = new Map<string, HostRecord>();
let layoutState: PtyHostLayoutState = { attachedIds: [], detachedIds: [] };

function emit(message: PtyHostEvent | PtyHostResponse) {
  parentPort.postMessage(message);
}

function emitLog(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  emit({
    type: 'log',
    payload: {
      level,
      message,
      meta,
    },
  });
}

function normalizeSize(cols: number, rows: number): { cols: number; rows: number } {
  return {
    cols: Number.isFinite(cols) ? Math.max(MIN_PTY_COLS, Math.floor(cols)) : MIN_PTY_COLS,
    rows: Number.isFinite(rows) ? Math.max(MIN_PTY_ROWS, Math.floor(rows)) : MIN_PTY_ROWS,
  };
}

function createReplayBuffer(
  cols: number,
  rows: number,
  replay?: PtyReplayState
): { terminal: HeadlessTerminal; serializeAddon: SerializeAddon; cols: number; rows: number } {
  const size = normalizeSize(replay?.cols ?? cols, replay?.rows ?? rows);
  const terminal = new HeadlessTerminal({
    cols: size.cols,
    rows: size.rows,
    scrollback: DEFAULT_SCROLLBACK,
    allowProposedApi: true,
  });
  const serializeAddon = new SerializeAddon();
  terminal.loadAddon(serializeAddon);
  if (replay?.data) {
    terminal.write(replay.data);
  }
  return { terminal, serializeAddon, cols: size.cols, rows: size.rows };
}

function serializeReplay(record: HostRecord): PtyReplayState {
  return {
    data: record.serializeAddon.serialize(),
    cols: record.cols,
    rows: record.rows,
  };
}

function currentLayout(): PtyHostLayoutState {
  const attachedIds: string[] = [];
  const detachedIds: string[] = [];
  for (const record of records.values()) {
    if (record.closing || !record.persist) continue;
    if (record.attachedCount > 0) attachedIds.push(record.id);
    else detachedIds.push(record.id);
  }
  if (attachedIds.length === 0 && detachedIds.length === 0) {
    return layoutState;
  }
  return { attachedIds, detachedIds };
}

function updateStoredLayout(): void {
  layoutState = currentLayout();
}

function cancelPromptHandle(record: HostRecord): void {
  if (record.promptHandle) {
    record.promptHandle.cancel();
    record.promptHandle = null;
  }
}

function clearGraceTimer(record: HostRecord): void {
  if (record.graceTimer) {
    clearTimeout(record.graceTimer);
    record.graceTimer = null;
  }
}

function scheduleGraceTimer(record: HostRecord, shortGrace = false): void {
  clearGraceTimer(record);
  const timeoutMs = shortGrace ? SHORT_DETACH_GRACE_MS : LONG_DETACH_GRACE_MS;
  record.graceTimer = setTimeout(() => {
    record.persist = false;
    record.closing = true;
    cancelPromptHandle(record);
    records.delete(record.id);
    updateStoredLayout();
    try {
      record.proc.kill();
    } catch {}
  }, timeoutMs);
}

function writeAfterPrompt(record: HostRecord, data: string, label: string): void {
  cancelPromptHandle(record);
  record.promptHandle = waitForShellPrompt({
    subscribe: (cb) => {
      const disposable = record.proc.onData(cb);
      return () => disposable.dispose();
    },
    write: (payload) => {
      try {
        record.proc.write(payload);
      } finally {
        record.promptHandle = null;
      }
    },
    data,
    onTimeout: () =>
      emitLog('warn', `${label} SSH shell prompt not detected, writing init commands anyway`, {
        id: record.id,
      }),
  });
}

function createPty(plan: PtySpawnPlan): IPty {
  return ptyModule.spawn(plan.command, plan.args, {
    name: 'xterm-256color',
    cols: plan.cols,
    rows: plan.rows,
    cwd: plan.cwd,
    env: plan.env,
  });
}

function finalizeExit(record: HostRecord, exitCode: number, signal?: number): void {
  if (record.closing) return;
  record.closing = true;
  cancelPromptHandle(record);
  clearGraceTimer(record);
  records.delete(record.id);
  updateStoredLayout();
  emit({
    type: 'exit',
    payload: {
      id: record.id,
      exitCode,
      ...(signal !== undefined ? { signal } : {}),
    },
  });
}

function bindProcess(record: HostRecord, proc: IPty): void {
  record.proc = proc;
  record.closing = false;
  clearGraceTimer(record);

  proc.onData((chunk) => {
    if (record.closing) return;
    try {
      record.replayTerminal.write(chunk);
    } catch (error) {
      emitLog('warn', 'Failed to write PTY output into headless replay buffer', {
        id: record.id,
        error: String(error),
      });
    }
    emit({
      type: 'data',
      payload: {
        id: record.id,
        chunk,
      },
    });
  });

  proc.onExit(({ exitCode, signal }) => {
    if (record.closing) return;
    if (record.proc !== proc) return;

    if (record.fallback && record.persist) {
      try {
        const replacement = createPty(record.fallback.spawn);
        record.spawn = record.fallback.spawn;
        record.persistentRequest = record.fallback.persistentRequest;
        const emitStarted = record.fallback.emitStarted === true;
        record.fallback = undefined;
        const nextSize = normalizeSize(record.spawn.cols, record.spawn.rows);
        record.cols = nextSize.cols;
        record.rows = nextSize.rows;
        try {
          record.replayTerminal.resize(nextSize.cols, nextSize.rows);
        } catch {}
        bindProcess(record, replacement);
        if (emitStarted) {
          emit({
            type: 'started',
            payload: { id: record.id },
          });
        }
        return;
      } catch (error) {
        emitLog('error', 'Failed to replace direct PTY with fallback shell', {
          id: record.id,
          error: String(error),
        });
      }
    }

    finalizeExit(record, exitCode, signal);
  });

  if (record.spawn.waitForPromptData) {
    writeAfterPrompt(
      record,
      record.spawn.waitForPromptData,
      record.spawn.waitForPromptLabel || 'ptyHost'
    );
  }
}

function createRecord(options: {
  id: string;
  kind: 'local' | 'ssh';
  spawn: PtySpawnPlan;
  persistentRequest: PersistentPtyLaunchRequest;
  fallback?: HostRecord['fallback'];
  replay?: PtyReplayState;
  attachedCount: number;
}): HostRecord {
  const replay = createReplayBuffer(options.spawn.cols, options.spawn.rows, options.replay);
  const record: HostRecord = {
    id: options.id,
    kind: options.kind,
    proc: createPty(options.spawn),
    cols: replay.cols,
    rows: replay.rows,
    attachedCount: options.attachedCount,
    spawn: options.spawn,
    persistentRequest: options.persistentRequest,
    fallback: options.fallback,
    replayTerminal: replay.terminal,
    serializeAddon: replay.serializeAddon,
    graceTimer: null,
    promptHandle: null,
    closing: false,
    persist: true,
  };

  records.set(record.id, record);
  bindProcess(record, record.proc);

  if (record.attachedCount <= 0) {
    scheduleGraceTimer(record);
  }

  updateStoredLayout();
  return record;
}

function createOrAttach(
  launch:
    | {
        id: string;
        kind: 'local' | 'ssh';
        spawn: PtySpawnPlan;
        persistentRequest: PersistentPtyLaunchRequest;
        fallback?: HostRecord['fallback'];
      }
    | PtyHostReviveLaunch,
  attachedCount: number
): { id: string; created: boolean; replay: PtyReplayState } {
  const existing = records.get(launch.id);
  if (existing) {
    existing.attachedCount += attachedCount;
    clearGraceTimer(existing);
    updateStoredLayout();
    return {
      id: existing.id,
      created: false,
      replay: serializeReplay(existing),
    };
  }

  const record = createRecord({
    id: launch.id,
    kind: launch.kind,
    spawn: launch.spawn,
    persistentRequest: launch.persistentRequest,
    fallback: 'fallback' in launch ? launch.fallback : undefined,
    replay: 'replay' in launch ? launch.replay : undefined,
    attachedCount,
  });
  return {
    id: record.id,
    created: true,
    replay: serializeReplay(record),
  };
}

function detach(id: string, shortGrace = false): void {
  const record = records.get(id);
  if (!record) return;
  record.attachedCount = Math.max(0, record.attachedCount - 1);
  if (record.attachedCount === 0) {
    scheduleGraceTimer(record, shortGrace);
  }
  updateStoredLayout();
}

function kill(id: string): void {
  const record = records.get(id);
  if (!record) return;
  record.persist = false;
  record.closing = true;
  cancelPromptHandle(record);
  clearGraceTimer(record);
  records.delete(id);
  updateStoredLayout();
  try {
    record.proc.kill();
  } catch {}
}

function resize(id: string, cols: number, rows: number): void {
  const record = records.get(id);
  if (!record) return;
  const nextSize = normalizeSize(cols, rows);
  if (record.cols === nextSize.cols && record.rows === nextSize.rows) {
    return;
  }
  record.cols = nextSize.cols;
  record.rows = nextSize.rows;
  try {
    record.proc.resize(nextSize.cols, nextSize.rows);
  } catch {}
  try {
    record.replayTerminal.resize(nextSize.cols, nextSize.rows);
  } catch {}
}

function serializeState(): SerializedPtyHostState {
  const terminals = [...records.values()]
    .filter((record) => !record.closing && record.persist)
    .map((record) => ({
      id: record.id,
      kind: record.kind,
      persistentRequest: record.persistentRequest,
      replay: serializeReplay(record),
    }));

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    layout: currentLayout(),
    terminals,
  };
}

async function handleRequest(request: PtyHostRequest): Promise<PtyHostResult> {
  switch (request.type) {
    case 'createOrAttach':
      return createOrAttach(request.payload.launch, 1);
    case 'detach':
      detach(request.payload.id, request.payload.shortGrace === true);
      return { ok: true };
    case 'kill':
      kill(request.payload.id);
      return { ok: true };
    case 'killMany': {
      const ids = Array.from(new Set(request.payload.ids.filter(Boolean)));
      for (const id of ids) {
        kill(id);
      }
      return { killed: ids.length };
    }
    case 'input': {
      const record = records.get(request.payload.id);
      if (!record) return { ok: true };
      record.proc.write(request.payload.data);
      return { ok: true };
    }
    case 'resize':
      resize(request.payload.id, request.payload.cols, request.payload.rows);
      return { ok: true };
    case 'serializeState':
      return { state: serializeState() };
    case 'revive': {
      const revivedIds: string[] = [];
      layoutState = request.payload.layout ?? { attachedIds: [], detachedIds: [] };
      for (const terminal of request.payload.terminals) {
        createOrAttach(terminal, 0);
        revivedIds.push(terminal.id);
      }
      updateStoredLayout();
      return { revivedIds };
    }
    case 'getActivePtyInfo':
      return {
        active: [...records.values()]
          .filter((record) => !record.closing)
          .map((record) => ({
            ptyId: record.id,
            pid: typeof record.proc.pid === 'number' ? record.proc.pid : null,
            kind: record.kind,
            cwd:
              record.persistentRequest.mode === 'direct'
                ? record.persistentRequest.cwd
                : record.persistentRequest.cwd,
          })),
      };
    case 'getLayout':
      return { layout: currentLayout() };
    case 'setLayout':
      layoutState = request.payload.layout;
      return { layout: layoutState };
  }
}

async function dispatch(request: PtyHostRequest): Promise<void> {
  try {
    const result = await handleRequest(request);
    emit({
      requestId: request.requestId,
      ok: true,
      result,
    });
  } catch (error) {
    emit({
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

process.on('uncaughtException', (error) => {
  emitLog('error', 'PTY host uncaught exception', {
    error: error instanceof Error ? error.stack || error.message : String(error),
  });
});

process.on('unhandledRejection', (error) => {
  emitLog('error', 'PTY host unhandled rejection', {
    error: error instanceof Error ? error.stack || error.message : String(error),
  });
});

function isPtyHostRequest(message: unknown): message is PtyHostRequest {
  if (!message || typeof message !== 'object') {
    return false;
  }

  return 'type' in message && 'requestId' in message && 'payload' in message;
}

function extractMessagePayload(message: unknown): unknown {
  if (
    message &&
    typeof message === 'object' &&
    'data' in message &&
    (message as { data?: unknown }).data !== undefined
  ) {
    return (message as { data: unknown }).data;
  }
  return message;
}

parentPort.on('message', (event) => {
  const message = extractMessagePayload(event);
  if (!isPtyHostRequest(message)) {
    return;
  }
  void dispatch(message);
});

emitLog('info', 'PTY host ready', {
  pid: process.pid,
});
