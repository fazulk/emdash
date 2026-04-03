import os from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import type { IPty } from 'node-pty';
import { log } from '../lib/logger';
import {
  getDefaultShell,
  mergeEnvWithNormalizedLocale,
} from './ptyLaunch';

export * from './ptyLaunch';

/**
 * Suppress EPIPE/EIO errors on a PTY's underlying socket.
 *
 * On Windows, ConPTY emits EPIPE (not EIO) when the pipe breaks during
 * process shutdown. node-pty's built-in error handler only suppresses EIO,
 * so EPIPE becomes an uncaught exception. Registering an additional error
 * listener bumps the listener count to >= 2, which causes node-pty to
 * swallow the error instead of throwing.
 */
function suppressPtyPipeErrors(proc: IPty): void {
  if (process.platform !== 'win32') return;

  (proc as any).on?.('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE' || err.code === 'EIO') return;
    log.warn('ptyManager: unexpected PTY error', { code: err.code, message: err.message });
  });
}

export interface LifecyclePtyHandle {
  pid: number | null;
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (exitCode: number | null, signal: string | null) => void) => void;
  onError: (callback: (error: Error) => void) => void;
  kill: (signal?: string) => void;
}

export function createUtf8StreamForwarder(emitData: (data: string) => void): {
  pushStdout: (buf: Buffer) => void;
  pushStderr: (buf: Buffer) => void;
  flush: () => void;
} {
  const stdoutDecoder = new StringDecoder('utf8');
  const stderrDecoder = new StringDecoder('utf8');
  let flushed = false;

  const emitIfPresent = (data: string) => {
    if (!data) return;
    emitData(data);
  };

  return {
    pushStdout: (buf: Buffer) => {
      emitIfPresent(stdoutDecoder.write(buf));
    },
    pushStderr: (buf: Buffer) => {
      emitIfPresent(stderrDecoder.write(buf));
    },
    flush: () => {
      if (flushed) return;
      flushed = true;
      emitIfPresent(stdoutDecoder.end());
      emitIfPresent(stderrDecoder.end());
    },
  };
}

type LifecycleSpawnFallbackChild = {
  stdout?: { on: (event: 'data', listener: (buf: Buffer) => void) => void } | null;
  stderr?: { on: (event: 'data', listener: (buf: Buffer) => void) => void } | null;
  on: (event: 'error' | 'exit' | 'close', listener: (...args: any[]) => void) => void;
};

export function attachLifecycleSpawnFallbackHandlers(
  child: LifecycleSpawnFallbackChild,
  callbacks: {
    onData: (data: string) => void;
    onExit: (exitCode: number | null, signal: string | null) => void;
    onError: (error: Error) => void;
  }
): void {
  const { onData, onExit, onError } = callbacks;
  let didExit = false;
  let exitCode: number | null = null;
  let exitSignal: string | null = null;
  const forwarder = createUtf8StreamForwarder(onData);

  child.stdout?.on('data', (buf: Buffer) => {
    forwarder.pushStdout(buf);
  });
  child.stderr?.on('data', (buf: Buffer) => {
    forwarder.pushStderr(buf);
  });

  child.on('error', (error: Error) => {
    forwarder.flush();
    onError(error);
  });

  child.on('exit', (code: number | null, signal: string | null) => {
    didExit = true;
    exitCode = code;
    exitSignal = signal ?? null;
  });

  child.on('close', () => {
    forwarder.flush();
    if (!didExit) return;
    onExit(exitCode, exitSignal);
  });
}

function startLifecycleSpawnFallback(options: {
  id: string;
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): LifecyclePtyHandle {
  const { spawn } = require('node:child_process') as typeof import('node:child_process');
  const { command, cwd, env } = options;

  const child = spawn(command, {
    cwd: cwd || os.homedir(),
    shell: true,
    detached: true,
    env: mergeEnvWithNormalizedLocale(process.env, env),
  });

  const dataCallbacks: Array<(data: string) => void> = [];
  const exitCallbacks: Array<(exitCode: number | null, signal: string | null) => void> = [];
  const errorCallbacks: Array<(error: Error) => void> = [];

  attachLifecycleSpawnFallbackHandlers(child, {
    onData: (data) => {
      for (const cb of dataCallbacks) cb(data);
    },
    onExit: (code, signal) => {
      for (const cb of exitCallbacks) cb(code, signal);
    },
    onError: (error) => {
      for (const cb of errorCallbacks) cb(error);
    },
  });

  return {
    pid: child.pid ?? null,
    onData: (cb) => dataCallbacks.push(cb),
    onExit: (cb) => exitCallbacks.push(cb),
    onError: (cb) => errorCallbacks.push(cb),
    kill: (signal?: string) => {
      const pid = child.pid;
      if (!pid) return;
      try {
        if (process.platform === 'win32') {
          const args = ['/PID', String(pid), '/T'];
          if (signal === 'SIGKILL') args.push('/F');
          spawn('taskkill', args, { stdio: 'ignore' }).unref();
        } else {
          process.kill(-pid, (signal as NodeJS.Signals) || 'SIGTERM');
        }
      } catch {
        try {
          child.kill((signal as NodeJS.Signals) || 'SIGTERM');
        } catch {}
      }
    },
  };
}

export function startLifecyclePty(options: {
  id: string;
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): LifecyclePtyHandle {
  if (process.env.EMDASH_DISABLE_PTY === '1') {
    return startLifecycleSpawnFallback(options);
  }

  let pty: typeof import('node-pty');
  try {
    pty = require('node-pty');
  } catch {
    return startLifecycleSpawnFallback(options);
  }

  const { id, command, cwd, env } = options;
  const defaultShell = getDefaultShell();
  const useEnv = mergeEnvWithNormalizedLocale({
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'emdash',
    HOME: process.env.HOME || os.homedir(),
    USER: process.env.USER || os.userInfo().username,
    SHELL: process.env.SHELL || defaultShell,
    ...(env || {}),
  });

  const proc = pty.spawn(defaultShell, ['-ilc', command], {
    name: 'xterm-256color',
    cols: 120,
    rows: 32,
    cwd: cwd || os.homedir(),
    env: useEnv,
  });
  suppressPtyPipeErrors(proc);

  const dataCallbacks: Array<(data: string) => void> = [];
  const exitCallbacks: Array<(exitCode: number | null, signal: string | null) => void> = [];
  const errorCallbacks: Array<(error: Error) => void> = [];

  proc.onData((data: string) => {
    for (const cb of dataCallbacks) {
      cb(data);
    }
  });

  proc.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
    for (const cb of exitCallbacks) {
      cb(exitCode, signal != null ? String(signal) : null);
    }
  });

  const emitError = (error: unknown) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    for (const cb of errorCallbacks) {
      cb(normalized);
    }
  };

  try {
    const maybeProc = proc as IPty & {
      on?: (event: string, listener: (error: unknown) => void) => void;
    };
    maybeProc.on?.('error', emitError);
  } catch {}

  return {
    pid: typeof proc.pid === 'number' ? proc.pid : null,
    onData: (cb) => dataCallbacks.push(cb),
    onExit: (cb) => exitCallbacks.push(cb),
    onError: (cb) => errorCallbacks.push(cb),
    kill: (signal?: string) => {
      try {
        proc.kill(signal);
      } catch {}
    },
  };
}
