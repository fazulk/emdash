import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type HostMessageListener = (message: unknown) => void;

type FakeParentPort = {
  listener: HostMessageListener | null;
  messages: unknown[];
  on: (event: 'message', listener: HostMessageListener) => void;
  postMessage: (message: unknown) => void;
};

type FakePty = {
  pid: number;
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  emitData: (chunk: string) => void;
  emitExit: (exitCode: number, signal?: number) => void;
  onData: (listener: (chunk: string) => void) => { dispose: () => void };
  onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => { dispose: () => void };
};

const spawnMock = vi.fn();

vi.mock('node-pty', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

function createFakePty(pid: number): FakePty {
  const dataListeners = new Set<(chunk: string) => void>();
  const exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>();

  return {
    pid,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    emitData: (chunk: string) => {
      for (const listener of dataListeners) {
        listener(chunk);
      }
    },
    emitExit: (exitCode: number, signal?: number) => {
      for (const listener of exitListeners) {
        listener({ exitCode, signal });
      }
    },
    onData: (listener) => {
      dataListeners.add(listener);
      return {
        dispose: () => dataListeners.delete(listener),
      };
    },
    onExit: (listener) => {
      exitListeners.add(listener);
      return {
        dispose: () => exitListeners.delete(listener),
      };
    },
  };
}

function createParentPort(): FakeParentPort {
  return {
    listener: null,
    messages: [],
    on: (_event, listener) => {
      port.listener = listener;
    },
    postMessage: (message) => {
      port.messages.push(message);
    },
  };
}

let port: FakeParentPort;
let nextPid = 4000;
let originalParentPort: unknown;
const mutableProcess = process as unknown as { parentPort?: unknown };

async function loadHostProcess() {
  vi.resetModules();
  port = createParentPort();
  nextPid = 4000;
  spawnMock.mockImplementation(() => createFakePty(++nextPid));
  mutableProcess.parentPort = port;
  await import('../../main/services/ptyHostProcess');
  expect(port.listener).toBeTypeOf('function');
}

async function sendRequest(request: Record<string, unknown>) {
  const startIndex = port.messages.length;
  port.listener?.({ data: request });
  await Promise.resolve();
  await Promise.resolve();
  return port.messages
    .slice(startIndex)
    .find(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        'requestId' in message &&
        (message as { requestId?: unknown }).requestId === request.requestId
    ) as { ok: boolean; result?: unknown; error?: string } | undefined;
}

function createLaunch(id: string) {
  return {
    id,
    kind: 'local' as const,
    spawn: {
      command: '/bin/zsh',
      args: ['-il'],
      cwd: '/tmp/project',
      env: { TERM: 'xterm-256color' },
      cols: 120,
      rows: 32,
    },
    persistentRequest: {
      mode: 'shell' as const,
      id,
      cwd: '/tmp/project',
      shell: '/bin/zsh',
      cols: 120,
      rows: 32,
    },
  };
}

describe('ptyHostProcess', () => {
  beforeEach(() => {
    originalParentPort = mutableProcess.parentPort;
  });

  afterEach(() => {
    mutableProcess.parentPort = originalParentPort;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reuses an existing PTY on attach instead of spawning a second process', async () => {
    await loadHostProcess();

    const first = await sendRequest({
      requestId: 'create-1',
      type: 'createOrAttach',
      payload: { launch: createLaunch('pty-reuse') },
    });
    expect(first).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        id: 'pty-reuse',
        created: true,
      }),
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const second = await sendRequest({
      requestId: 'create-2',
      type: 'createOrAttach',
      payload: { launch: createLaunch('pty-reuse') },
    });
    expect(second).toMatchObject({
      ok: true,
      result: expect.objectContaining({
        id: 'pty-reuse',
        created: false,
      }),
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('kills a detached PTY when the short grace timer expires', async () => {
    vi.useFakeTimers();
    await loadHostProcess();

    await sendRequest({
      requestId: 'create-short-grace',
      type: 'createOrAttach',
      payload: { launch: createLaunch('pty-short-grace') },
    });

    const proc = spawnMock.mock.results[0]?.value as FakePty;
    expect(proc).toBeTruthy();

    const detach = await sendRequest({
      requestId: 'detach-short-grace',
      type: 'detach',
      payload: { id: 'pty-short-grace', shortGrace: true },
    });
    expect(detach).toMatchObject({ ok: true });

    vi.advanceTimersByTime(29_999);
    expect(proc.kill).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(proc.kill).toHaveBeenCalledTimes(1);
  });

  it('removes a killed PTY from serialized revive state immediately', async () => {
    await loadHostProcess();

    await sendRequest({
      requestId: 'create-for-kill',
      type: 'createOrAttach',
      payload: { launch: createLaunch('pty-kill') },
    });

    const proc = spawnMock.mock.results[0]?.value as FakePty;
    expect(proc).toBeTruthy();

    const killed = await sendRequest({
      requestId: 'kill-now',
      type: 'kill',
      payload: { id: 'pty-kill' },
    });
    expect(killed).toMatchObject({ ok: true });
    expect(proc.kill).toHaveBeenCalledTimes(1);

    const serialized = await sendRequest({
      requestId: 'serialize-after-kill',
      type: 'serializeState',
      payload: {},
    });
    expect(serialized).toMatchObject({
      ok: true,
      result: {
        state: expect.objectContaining({
          terminals: [],
        }),
      },
    });
  });
});
