import { getTaskEnvVars } from '@shared/task/envVars';
import type {
  LifecyclePhase,
  LifecyclePhaseState,
  LifecycleScriptConfig,
  TaskLifecycleState,
} from '@shared/lifecycle';

export type LifecyclePhaseStatus = TaskLifecycleState['setup']['status'];

type LifecycleResult = {
  success: boolean;
  skipped?: boolean;
  error?: string;
};

type LifecycleRunArgs = {
  taskId: string;
  taskPath: string;
  projectPath: string;
  taskName?: string;
  phase: LifecyclePhase;
  defaultBranch?: string;
  portSeed?: string;
};

type LifecycleStopArgs = {
  taskId: string;
  taskPath: string;
  projectPath: string;
  taskName?: string;
  defaultBranch?: string;
  portSeed?: string;
};

type PtyStartResult = {
  ok: boolean;
  reused?: boolean;
  error?: string;
};

type CommandResult = {
  exitCode: number;
};

type ActiveExecution = {
  taskId: string;
  phase: LifecyclePhase;
  promise: Promise<CommandResult>;
  stopRequested: boolean;
};

const COMMAND_EXIT_RE = /__EMDASH_LIFECYCLE_EXIT__([0-9.]+)__:(-?\d+)/;
const startPromises = new Map<string, Promise<PtyStartResult>>();
const inflight = new Map<string, Promise<LifecycleResult>>();
const activeExecutions = new Map<string, ActiveExecution>();
const states = new Map<string, TaskLifecycleState>();
const listeners = new Map<string, Set<() => void>>();

function nowIso(): string {
  return new Date().toISOString();
}

function createPhaseState(): LifecyclePhaseState {
  return { status: 'idle', error: null, exitCode: null };
}

function defaultState(taskId: string): TaskLifecycleState {
  return {
    taskId,
    setup: createPhaseState(),
    run: { ...createPhaseState(), pid: null },
    teardown: createPhaseState(),
  };
}

function ensureState(taskId: string): TaskLifecycleState {
  const existing = states.get(taskId);
  if (existing) return existing;
  const state = defaultState(taskId);
  states.set(taskId, state);
  return state;
}

function emit(taskId: string): void {
  const set = listeners.get(taskId);
  if (!set) return;
  for (const listener of set) {
    try {
      listener();
    } catch {}
  }
}

function setPhaseState(
  taskId: string,
  phase: LifecyclePhase,
  next: Partial<LifecyclePhaseState> & { status: LifecyclePhaseStatus }
): void {
  const state = ensureState(taskId);
  const current = state[phase];
  state[phase] = {
    ...current,
    ...next,
  };
  emit(taskId);
}

function normalizeTaskName(taskName: string | undefined, taskId: string, taskPath: string): string {
  return taskName?.trim() || taskPath.split('/').filter(Boolean).pop() || taskId;
}

function buildLifecycleEnv(args: {
  taskId: string;
  taskPath: string;
  projectPath: string;
  taskName?: string;
  defaultBranch?: string;
  portSeed?: string;
}): Record<string, string> {
  return getTaskEnvVars({
    taskId: args.taskId,
    taskName: normalizeTaskName(args.taskName, args.taskId, args.taskPath),
    taskPath: args.taskPath,
    projectPath: args.projectPath,
    defaultBranch: args.defaultBranch,
    portSeed: args.portSeed,
  });
}

export function lifecycleTerminalId(taskId: string, phase: LifecyclePhase): string {
  return `lifecycle-${phase}-${taskId}`;
}

function inflightKey(taskId: string, taskPath: string, phase: LifecyclePhase): string {
  return `${taskId}::${taskPath}::${phase}`;
}

async function getScript(
  projectPath: string,
  phase: keyof LifecycleScriptConfig
): Promise<string | null> {
  const api = window.electronAPI as any;
  const result = await api?.lifecycleGetScript?.({ projectPath, phase });
  if (!result?.success) return null;
  return typeof result.script === 'string' && result.script.trim() ? result.script.trim() : null;
}

async function ensureTerminalStarted(args: {
  id: string;
  cwd: string;
  env: Record<string, string>;
}): Promise<PtyStartResult> {
  const existing = startPromises.get(args.id);
  if (existing) return existing;

  const promise = window.electronAPI
    .ptyStart({
      id: args.id,
      cwd: args.cwd,
      env: args.env,
    })
    .then(async (result) => {
      if (result?.ok && result.attachToken) {
        try {
          await window.electronAPI.ptyConfirmAttach({
            id: args.id,
            attachToken: result.attachToken,
          });
        } catch {}
      }
      return { ok: Boolean(result?.ok), reused: result?.reused, error: result?.error };
    })
    .finally(() => {
      startPromises.delete(args.id);
    });

  startPromises.set(args.id, promise);
  return promise;
}

function normalizeCommandForTerminal(command: string): string {
  return command.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r');
}

async function executeCommandInTerminal(args: {
  terminalId: string;
  cwd: string;
  env: Record<string, string>;
  command: string;
}): Promise<CommandResult> {
  const startResult = await ensureTerminalStarted({
    id: args.terminalId,
    cwd: args.cwd,
    env: args.env,
  });
  if (!startResult.ok) {
    throw new Error(startResult.error || 'Failed to start terminal');
  }

  return new Promise<CommandResult>((resolve, reject) => {
    let settled = false;
    let buffer = '';

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try {
        offData?.();
      } catch {}
      try {
        offExit?.();
      } catch {}
      fn();
    };

    const offData = window.electronAPI.onPtyData(args.terminalId, (chunk) => {
      if (settled) return;
      buffer = `${buffer}${chunk}`.slice(-8192);
      const match = buffer.match(COMMAND_EXIT_RE);
      if (!match) return;
      const exitCode = Number.parseInt(match[2] || '1', 10);
      finish(() => resolve({ exitCode: Number.isFinite(exitCode) ? exitCode : 1 }));
    });

    const offExit = window.electronAPI.onPtyExit(args.terminalId, (info) => {
      finish(() => {
        reject(
          new Error(
            `Terminal exited before lifecycle command completed${
              typeof info?.exitCode === 'number' ? ` (exit ${info.exitCode})` : ''
            }`
          )
        );
      });
    });

    const send = () => {
      try {
        const normalized = normalizeCommandForTerminal(args.command);
        window.electronAPI.ptyInput({ id: args.terminalId, data: normalized });
        window.electronAPI.ptyInput({
          id: args.terminalId,
          data: `\rprintf '__EMDASH_LIFECYCLE_EXIT__%s__:%s\\n' "$$.$RANDOM.$SECONDS" "$?"\r`,
        });
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    };

    window.setTimeout(send, startResult.reused ? 50 : 300);
  });
}

function currentPhaseStatus(taskId: string, phase: LifecyclePhase): LifecyclePhaseStatus {
  return ensureState(taskId)[phase].status;
}

async function runPhaseInternal(args: LifecycleRunArgs): Promise<LifecycleResult> {
  if (args.phase === 'run') {
    const runTerminalId = lifecycleTerminalId(args.taskId, 'run');
    if (activeExecutions.has(runTerminalId)) {
      return { success: true, skipped: true };
    }

    const setupScript = await getScript(args.projectPath, 'setup');
    const setupStatus = currentPhaseStatus(args.taskId, 'setup');
    if (setupScript) {
      if (setupStatus === 'idle' || setupStatus === 'failed') {
        const setupResult = await runLifecyclePhase({ ...args, phase: 'setup' });
        if (!setupResult.success) {
          return { success: false, error: `Setup failed: ${setupResult.error || 'Unknown error'}` };
        }
      } else if (setupStatus === 'running') {
        return { success: false, error: 'Setup is still running' };
      }
    }
  }

  const script = await getScript(args.projectPath, args.phase);
  if (!script) {
    return { success: true, skipped: true };
  }

  const terminalId = lifecycleTerminalId(args.taskId, args.phase);
  const env = buildLifecycleEnv(args);
  setPhaseState(args.taskId, args.phase, {
    status: 'running',
    startedAt: nowIso(),
    finishedAt: undefined,
    exitCode: null,
    error: null,
  });

  const executionPromise = executeCommandInTerminal({
    terminalId,
    cwd: args.taskPath,
    env,
    command: script,
  });
  const active: ActiveExecution = {
    taskId: args.taskId,
    phase: args.phase,
    promise: executionPromise,
    stopRequested: false,
  };
  activeExecutions.set(terminalId, active);

  try {
    const result = await executionPromise;
    const stopped = args.phase === 'run' && active.stopRequested;
    setPhaseState(args.taskId, args.phase, {
      status: stopped ? 'idle' : result.exitCode === 0 ? 'succeeded' : 'failed',
      finishedAt: nowIso(),
      exitCode: result.exitCode,
      error: stopped || result.exitCode === 0 ? null : `Exited with code ${String(result.exitCode)}`,
    });
    return stopped || result.exitCode === 0
      ? { success: true }
      : { success: false, error: `Exited with code ${String(result.exitCode)}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setPhaseState(args.taskId, args.phase, {
      status: active.stopRequested && args.phase === 'run' ? 'idle' : 'failed',
      finishedAt: nowIso(),
      error: active.stopRequested && args.phase === 'run' ? null : message,
    });
    return active.stopRequested && args.phase === 'run'
      ? { success: true }
      : { success: false, error: message };
  } finally {
    if (activeExecutions.get(terminalId) === active) {
      activeExecutions.delete(terminalId);
    }
  }
}

export async function runLifecyclePhase(args: LifecycleRunArgs): Promise<LifecycleResult> {
  const key = inflightKey(args.taskId, args.taskPath, args.phase);
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = runPhaseInternal(args).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

export async function stopLifecycleRun(args: LifecycleStopArgs): Promise<LifecycleResult> {
  const terminalId = lifecycleTerminalId(args.taskId, 'run');
  const active = activeExecutions.get(terminalId);
  if (!active) {
    setPhaseState(args.taskId, 'run', {
      status: 'idle',
      finishedAt: nowIso(),
      error: null,
      exitCode: null,
    });
    return { success: true, skipped: true };
  }

  active.stopRequested = true;
  try {
    window.electronAPI.ptyInput({ id: terminalId, data: '\x03' });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }

  await active.promise.catch(() => {});

  const stopScript = await getScript(args.projectPath, 'stop');
  if (stopScript) {
    const env = buildLifecycleEnv(args);
    try {
      await executeCommandInTerminal({
        terminalId,
        cwd: args.taskPath,
        env,
        command: stopScript,
      });
    } catch {
      // Best-effort, matching the old behavior.
    }
  }

  setPhaseState(args.taskId, 'run', {
    status: 'idle',
    finishedAt: nowIso(),
    error: null,
  });
  return { success: true };
}

export function subscribeLifecycleTask(taskId: string, listener: () => void): () => void {
  const set = listeners.get(taskId) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(taskId, set);
  return () => {
    const current = listeners.get(taskId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(taskId);
    }
  };
}

export function getLifecycleTaskSnapshot(taskId: string): TaskLifecycleState {
  const state = ensureState(taskId);
  return {
    taskId: state.taskId,
    setup: { ...state.setup },
    run: { ...state.run },
    teardown: { ...state.teardown },
  };
}

export function clearLifecycleTask(taskId: string): void {
  states.delete(taskId);
  listeners.delete(taskId);
}
