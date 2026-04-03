import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type IpcHandler = (...args: any[]) => any;

const ipcHandleHandlers = new Map<string, IpcHandler>();
const ipcOnHandlers = new Map<string, IpcHandler>();

const browserWindows: Array<{ webContents: MockWebContents }> = [];
const getAllWindowsMock = vi.fn(() => browserWindows);

const hostEmitter = new EventEmitter();
const createOrAttachMock = vi.fn();
const detachMock = vi.fn();
const killMock = vi.fn();
const inputMock = vi.fn();
const resizeMock = vi.fn();
const readPersistedStateMock = vi.fn();
const clearPersistedStateMock = vi.fn();
const reviveMock = vi.fn();
const serializeStateMock = vi.fn();
const writePersistedStateMock = vi.fn();

const prepareLocalShellLaunchMock = vi.fn();
const prepareLocalDirectLaunchMock = vi.fn();
const prepareSshLaunchMock = vi.fn();
const resolveProviderCommandConfigMock = vi.fn();
const buildProviderCliArgsMock = vi.fn();
const getProviderRuntimeCliArgsMock = vi.fn();
const parseShellArgsMock = vi.fn((input: string) =>
  input
    .match(/"[^"]*"|'[^']*'|[^\s]+/g)
    ?.map((part) => part.replace(/^['"]|['"]$/g, '')) ?? []
);
const maybeAutoTrustForClaudeMock = vi.fn();
const awaitSetupMock = vi.fn();
const getShellSetupMock = vi.fn();
const getTaskByPathMock = vi.fn();
const getProjectByIdMock = vi.fn();
const getDrizzleClientMock = vi.fn();
const getProviderMock = vi.fn((providerId: string) => ({
  id: providerId,
  cli: providerId,
  installCommand: `install ${providerId}`,
  useKeystrokeInjection: false,
}));
const parsePtyIdMock = vi.fn((_id: string) => null);
const telemetryCaptureMock = vi.fn();

class MockWebContents extends EventEmitter {
  sent: Array<{ channel: string; payload: unknown }> = [];
  private destroyed = false;

  constructor(readonly id: number) {
    super();
  }

  send = vi.fn((channel: string, payload: unknown) => {
    this.sent.push({ channel, payload });
  });

  isDestroyed = vi.fn(() => this.destroyed);

  destroy() {
    this.destroyed = true;
    this.emit('destroyed');
  }
}

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => getAllWindowsMock(),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      ipcHandleHandlers.set(channel, handler);
    }),
    on: vi.fn((channel: string, handler: IpcHandler) => {
      ipcOnHandlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../main/services/ptyHostService', () => ({
  ptyHostService: {
    on: hostEmitter.on.bind(hostEmitter),
    createOrAttach: (...args: unknown[]) => createOrAttachMock(...args),
    detach: (...args: unknown[]) => detachMock(...args),
    kill: (...args: unknown[]) => killMock(...args),
    input: (...args: unknown[]) => inputMock(...args),
    resize: (...args: unknown[]) => resizeMock(...args),
    readPersistedState: (...args: unknown[]) => readPersistedStateMock(...args),
    clearPersistedState: (...args: unknown[]) => clearPersistedStateMock(...args),
    revive: (...args: unknown[]) => reviveMock(...args),
    serializeState: (...args: unknown[]) => serializeStateMock(...args),
    writePersistedState: (...args: unknown[]) => writePersistedStateMock(...args),
  },
}));

vi.mock('../../main/services/ptyLaunch', () => ({
  buildProviderCliArgs: (...args: any[]) => buildProviderCliArgsMock(...args),
  getProviderRuntimeCliArgs: (...args: any[]) => getProviderRuntimeCliArgsMock(...args),
  parseShellArgs: (input: string) => parseShellArgsMock(input),
  prepareLocalDirectLaunch: (...args: any[]) => prepareLocalDirectLaunchMock(...args),
  prepareLocalShellLaunch: (...args: any[]) => prepareLocalShellLaunchMock(...args),
  prepareSshLaunch: (...args: any[]) => prepareSshLaunchMock(...args),
  resolveProviderCommandConfig: (providerId: string) => resolveProviderCommandConfigMock(providerId),
}));

vi.mock('../../main/services/ClaudeConfigService', () => ({
  maybeAutoTrustForClaude: (...args: unknown[]) => maybeAutoTrustForClaudeMock(...args),
}));

vi.mock('../../main/services/TaskLifecycleService', () => ({
  taskLifecycleService: {
    awaitSetup: (...args: unknown[]) => awaitSetupMock(...args),
  },
}));

vi.mock('../../main/services/LifecycleScriptsService', () => ({
  lifecycleScriptsService: {
    getShellSetup: (...args: unknown[]) => getShellSetupMock(...args),
  },
}));

vi.mock('../../main/services/DatabaseService', () => ({
  databaseService: {
    getTaskByPath: (...args: unknown[]) => getTaskByPathMock(...args),
    getProjectById: (...args: unknown[]) => getProjectByIdMock(...args),
  },
}));

vi.mock('../../main/db/drizzleClient', () => ({
  getDrizzleClient: (...args: unknown[]) => getDrizzleClientMock(...args),
}));

vi.mock('../../main/services/ClaudeHookService', () => ({
  ClaudeHookService: {
    writeHookConfig: vi.fn(),
    mergeHookEntries: vi.fn(),
  },
}));

vi.mock('../../main/services/OpenCodeHookService', () => ({
  OPEN_CODE_PLUGIN_FILE: 'emdash-plugin.js',
  OpenCodeHookService: {
    writeLocalPlugin: vi.fn(() => '/tmp/opencode'),
    getRemoteConfigDir: vi.fn((ptyId: string) => `/tmp/${ptyId}`),
    getPluginSource: vi.fn(() => 'plugin source'),
  },
}));

vi.mock('../../main/services/TerminalConfigParser', () => ({
  detectAndLoadTerminalConfig: vi.fn(() => null),
}));

vi.mock('../../main/lib/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../main/telemetry', () => ({
  capture: (...args: unknown[]) => telemetryCaptureMock(...args),
}));

vi.mock('../../shared/providers/registry', () => ({
  PROVIDER_IDS: ['claude', 'codex'],
  getProvider: (providerId: string) => getProviderMock(providerId),
}));

vi.mock('../../shared/ptyId', () => ({
  parsePtyId: (id: string) => parsePtyIdMock(id),
}));

vi.mock('../../main/services/AgentEventService', () => ({
  agentEventService: {
    getPort: vi.fn(() => 0),
    getToken: vi.fn(() => 'hook-token'),
  },
}));

vi.mock('../../main/utils/shellEscape', () => ({
  quoteShellArg: (value: string) => value,
}));

function defaultShellSpawn(options: { cwd?: string; shell?: string; cols?: number; rows?: number }) {
  return {
    command: options.shell || '/bin/zsh',
    args: ['-il'],
    cwd: options.cwd || '/tmp/project',
    env: { TERM: 'xterm-256color' },
    cols: options.cols || 80,
    rows: options.rows || 24,
  };
}

function defaultDirectLaunch(options: {
  id: string;
  providerId: string;
  cwd: string;
  cols?: number;
  rows?: number;
}) {
  return {
    id: options.id,
    kind: 'local' as const,
    spawn: {
      command: `/usr/local/bin/${options.providerId}`,
      args: [],
      cwd: options.cwd,
      env: { TERM: 'xterm-256color' },
      cols: options.cols || 120,
      rows: options.rows || 32,
    },
    persistentRequest: {
      mode: 'direct' as const,
      id: options.id,
      providerId: options.providerId,
      cwd: options.cwd,
      cols: options.cols || 120,
      rows: options.rows || 32,
    },
    fallback: {
      spawn: defaultShellSpawn({
        cwd: options.cwd,
        cols: options.cols,
        rows: options.rows,
      }),
      persistentRequest: {
        mode: 'shell' as const,
        id: options.id,
        cwd: options.cwd,
        cols: options.cols || 120,
        rows: options.rows || 32,
      },
      emitStarted: true,
    },
  };
}

async function loadPtyIpc() {
  const module = await import('../../main/services/ptyIpc');
  module.registerPtyIpc();
  return module;
}

function getInvokeHandler(channel: string): IpcHandler {
  const handler = ipcHandleHandlers.get(channel);
  expect(handler).toBeTypeOf('function');
  return handler!;
}

function getOnHandler(channel: string): IpcHandler {
  const handler = ipcOnHandlers.get(channel);
  expect(handler).toBeTypeOf('function');
  return handler!;
}

describe('ptyIpc', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    ipcHandleHandlers.clear();
    ipcOnHandlers.clear();
    browserWindows.length = 0;
    hostEmitter.removeAllListeners();

    createOrAttachMock.mockResolvedValue({
      id: 'pty-default',
      created: true,
      replay: { data: '', cols: 80, rows: 24 },
    });
    detachMock.mockResolvedValue(undefined);
    killMock.mockResolvedValue(undefined);
    inputMock.mockResolvedValue(undefined);
    resizeMock.mockResolvedValue(undefined);
    readPersistedStateMock.mockResolvedValue(null);
    clearPersistedStateMock.mockResolvedValue(undefined);
    reviveMock.mockResolvedValue([]);
    serializeStateMock.mockResolvedValue({
      version: 1,
      savedAt: '2026-04-03T00:00:00.000Z',
      layout: { attachedIds: [], detachedIds: [] },
      terminals: [],
    });
    writePersistedStateMock.mockResolvedValue(undefined);

    prepareLocalShellLaunchMock.mockImplementation(defaultShellSpawn);
    prepareLocalDirectLaunchMock.mockImplementation(defaultDirectLaunch);
    prepareSshLaunchMock.mockImplementation((options: any) => ({
      command: 'ssh',
      args: ['-tt', options.target],
      cwd: '/tmp',
      env: { TERM: 'xterm-256color' },
      cols: options.cols || 120,
      rows: options.rows || 32,
      waitForPromptData: options.waitForPromptData,
      waitForPromptLabel: options.waitForPromptLabel,
    }));
    resolveProviderCommandConfigMock.mockImplementation((providerId: string) => ({
      provider: {
        id: providerId,
        cli: providerId,
        installCommand: `install ${providerId}`,
        useKeystrokeInjection: false,
      },
      cli: providerId,
      defaultArgs: [],
      autoApproveFlag: '--auto-approve',
      initialPromptFlag: '--prompt',
    }));
    buildProviderCliArgsMock.mockReturnValue([]);
    getProviderRuntimeCliArgsMock.mockReturnValue([]);
    getShellSetupMock.mockReturnValue(null);
    getTaskByPathMock.mockResolvedValue(null);
    getProjectByIdMock.mockResolvedValue(null);
    getDrizzleClientMock.mockResolvedValue({
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
          })),
        })),
      },
    });
    awaitSetupMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buffers host data until the renderer confirms the attach', async () => {
    vi.useFakeTimers();
    await loadPtyIpc();

    createOrAttachMock.mockResolvedValue({
      id: 'pty-buffer',
      created: true,
      replay: { data: 'saved output', cols: 90, rows: 30 },
    });

    const sender = new MockWebContents(1);
    browserWindows.push({ webContents: sender });

    const start = getInvokeHandler('pty:start');
    const confirmAttach = getInvokeHandler('pty:confirmAttach');

    const result = await start(
      { sender },
      {
        id: 'pty-buffer',
        cwd: '/tmp/project',
        shell: '/bin/zsh',
        cols: 90,
        rows: 30,
      }
    );

    expect(result).toMatchObject({
      ok: true,
      replay: { data: 'saved output', cols: 90, rows: 30 },
    });
    expect(result.attachToken).toEqual(expect.any(String));

    hostEmitter.emit('data', { id: 'pty-buffer', chunk: 'live output' });
    expect(sender.sent.filter((message) => message.channel === 'pty:data:pty-buffer')).toHaveLength(0);

    const confirm = await confirmAttach({}, { id: 'pty-buffer', attachToken: result.attachToken });
    expect(confirm).toEqual({ ok: true });

    vi.advanceTimersByTime(16);
    await Promise.resolve();

    expect(sender.sent).toContainEqual({
      channel: 'pty:data:pty-buffer',
      payload: 'live output',
    });
  });

  it('detaches the live PTY when the renderer is destroyed instead of killing it', async () => {
    await loadPtyIpc();

    createOrAttachMock.mockResolvedValue({
      id: 'pty-destroy',
      created: true,
      replay: { data: '', cols: 80, rows: 24 },
    });

    const sender = new MockWebContents(2);
    browserWindows.push({ webContents: sender });

    const start = getInvokeHandler('pty:start');
    const confirmAttach = getInvokeHandler('pty:confirmAttach');

    const result = await start(
      { sender },
      {
        id: 'pty-destroy',
        cwd: '/tmp/project',
      }
    );
    await confirmAttach({}, { id: 'pty-destroy', attachToken: result.attachToken });

    sender.destroy();
    await Promise.resolve();

    expect(detachMock).toHaveBeenCalledWith('pty-destroy', false);
    expect(killMock).not.toHaveBeenCalled();
  });

  it('kills the PTY immediately when an attached agent is explicitly closed', async () => {
    await loadPtyIpc();

    createOrAttachMock.mockResolvedValue({
      id: 'pty-close',
      created: true,
      replay: { data: '', cols: 80, rows: 24 },
    });

    const sender = new MockWebContents(4);
    browserWindows.push({ webContents: sender });

    const start = getInvokeHandler('pty:start');
    const confirmAttach = getInvokeHandler('pty:confirmAttach');
    const kill = getOnHandler('pty:kill');

    const result = await start(
      { sender },
      {
        id: 'pty-close',
        cwd: '/tmp/project',
      }
    );
    await confirmAttach({}, { id: 'pty-close', attachToken: result.attachToken });

    kill({}, { id: 'pty-close' });
    await Promise.resolve();

    expect(killMock).toHaveBeenCalledWith('pty-close');
    expect(detachMock).not.toHaveBeenCalled();
    expect(sender.sent).toContainEqual({
      channel: 'pty:exit:global',
      payload: { id: 'pty-close' },
    });
  });

  it('stores direct-launch revive state without persisting the one-time initialPrompt', async () => {
    await loadPtyIpc();

    createOrAttachMock.mockResolvedValue({
      id: 'pty-direct',
      created: true,
      replay: { data: '', cols: 120, rows: 32 },
    });

    const sender = new MockWebContents(3);
    browserWindows.push({ webContents: sender });

    const startDirect = getInvokeHandler('pty:startDirect');
    const result = await startDirect(
      { sender },
      {
        id: 'pty-direct',
        providerId: 'codex',
        cwd: '/tmp/project',
        cols: 120,
        rows: 32,
        autoApprove: true,
        initialPrompt: 'do not persist me',
      }
    );

    expect(result.ok).toBe(true);
    expect(prepareLocalDirectLaunchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pty-direct',
        providerId: 'codex',
        cwd: '/tmp/project',
        initialPrompt: 'do not persist me',
      })
    );

    const launch = createOrAttachMock.mock.calls[0]?.[0];
    expect(launch.persistentRequest).toMatchObject({
      mode: 'direct',
      id: 'pty-direct',
      providerId: 'codex',
      cwd: '/tmp/project',
      cols: 120,
      rows: 32,
      autoApprove: true,
    });
    expect(launch.persistentRequest).not.toHaveProperty('initialPrompt');
  });

  it('persists host state on quit and clears stale persisted state when there are no terminals', async () => {
    const { persistPtyHostStateForQuit } = await loadPtyIpc();

    serializeStateMock.mockResolvedValueOnce({
      version: 1,
      savedAt: '2026-04-03T00:00:00.000Z',
      layout: { attachedIds: ['pty-1'], detachedIds: [] },
      terminals: [
        {
          id: 'pty-1',
          kind: 'local',
          persistentRequest: {
            mode: 'shell',
            id: 'pty-1',
            cwd: '/tmp/project',
            shell: '/bin/zsh',
          },
          replay: { data: 'saved output', cols: 100, rows: 40 },
        },
      ],
    });

    await persistPtyHostStateForQuit();
    expect(writePersistedStateMock).toHaveBeenCalledTimes(1);
    expect(clearPersistedStateMock).not.toHaveBeenCalled();

    serializeStateMock.mockResolvedValueOnce({
      version: 1,
      savedAt: '2026-04-03T00:00:00.000Z',
      layout: { attachedIds: [], detachedIds: [] },
      terminals: [],
    });

    await persistPtyHostStateForQuit();
    expect(clearPersistedStateMock).toHaveBeenCalledTimes(1);
  });

  it('autosaves PTY replay state shortly after a terminal starts', async () => {
    vi.useFakeTimers();
    await loadPtyIpc();

    createOrAttachMock.mockResolvedValue({
      id: 'pty-autosave',
      created: true,
      replay: { data: '', cols: 80, rows: 24 },
    });
    serializeStateMock.mockResolvedValue({
      version: 1,
      savedAt: '2026-04-03T00:00:00.000Z',
      layout: { attachedIds: ['pty-autosave'], detachedIds: [] },
      terminals: [
        {
          id: 'pty-autosave',
          kind: 'local',
          persistentRequest: {
            mode: 'shell',
            id: 'pty-autosave',
            cwd: '/tmp/project',
            shell: '/bin/zsh',
          },
          replay: { data: 'saved output', cols: 80, rows: 24 },
        },
      ],
    });

    const sender = new MockWebContents(7);
    browserWindows.push({ webContents: sender });

    const start = getInvokeHandler('pty:start');
    await start(
      { sender },
      {
        id: 'pty-autosave',
        cwd: '/tmp/project',
      }
    );

    await vi.advanceTimersByTimeAsync(1_000);

    expect(serializeStateMock).toHaveBeenCalledTimes(1);
    expect(writePersistedStateMock).toHaveBeenCalledTimes(1);
  });

  it('reports partial failures when bulk cleanup kills multiple agent PTYs', async () => {
    await loadPtyIpc();

    killMock.mockImplementation(async (id: string) => {
      if (id === 'pty-fail') {
        throw new Error('kill failed');
      }
    });

    const cleanupSessions = getInvokeHandler('pty:cleanupSessions');
    const result = await cleanupSessions({}, { ids: ['pty-ok', 'pty-fail', 'pty-ok'] });

    expect(killMock).toHaveBeenCalledTimes(2);
    expect(killMock).toHaveBeenNthCalledWith(1, 'pty-ok');
    expect(killMock).toHaveBeenNthCalledWith(2, 'pty-fail');
    expect(result).toEqual({
      ok: false,
      cleaned: 1,
      failedIds: ['pty-fail'],
    });
  });

  it('revives persisted terminals from replay state without resending initialPrompt', async () => {
    const { revivePersistedPtys } = await loadPtyIpc();

    readPersistedStateMock.mockResolvedValue({
      version: 1,
      savedAt: '2026-04-03T00:00:00.000Z',
      layout: { attachedIds: [], detachedIds: ['pty-revive'] },
      terminals: [
        {
          id: 'pty-revive',
          kind: 'local',
          persistentRequest: {
            mode: 'shell',
            id: 'pty-revive',
            cwd: '/tmp/project',
            shell: '/bin/zsh',
          },
          replay: {
            data: 'restored scrollback',
            cols: 111,
            rows: 41,
          },
        },
      ],
    });

    await revivePersistedPtys();

    expect(prepareLocalShellLaunchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pty-revive',
        cwd: '/tmp/project',
        shell: '/bin/zsh',
        cols: 111,
        rows: 41,
      })
    );
    expect(prepareLocalShellLaunchMock.mock.calls[0]?.[0].initialPrompt).toBeUndefined();
    expect(reviveMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'pty-revive',
          replay: {
            data: 'restored scrollback',
            cols: 111,
            rows: 41,
          },
        }),
      ],
      { attachedIds: [], detachedIds: ['pty-revive'] }
    );
    expect(clearPersistedStateMock).not.toHaveBeenCalled();
  });

  it('returns persisted replay when a PTY launch cannot be rebuilt', async () => {
    await loadPtyIpc();

    prepareLocalShellLaunchMock.mockImplementation(() => {
      throw new Error('shell missing');
    });
    readPersistedStateMock.mockResolvedValue({
      version: 1,
      savedAt: '2026-04-03T00:00:00.000Z',
      layout: { attachedIds: [], detachedIds: ['pty-replay-only'] },
      terminals: [
        {
          id: 'pty-replay-only',
          kind: 'local',
          persistentRequest: {
            mode: 'shell',
            id: 'pty-replay-only',
            cwd: '/tmp/project',
            shell: '/bin/zsh',
          },
          replay: { data: 'persisted replay', cols: 90, rows: 33 },
        },
      ],
    });

    const sender = new MockWebContents(8);
    browserWindows.push({ webContents: sender });

    const start = getInvokeHandler('pty:start');
    const result = await start(
      { sender },
      {
        id: 'pty-replay-only',
        cwd: '/tmp/project',
        shell: '/bin/zsh',
      }
    );

    expect(result).toMatchObject({
      ok: false,
      replay: { data: 'persisted replay', cols: 90, rows: 33 },
    });
  });
});
