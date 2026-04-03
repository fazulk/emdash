import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import { eq } from 'drizzle-orm';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { log } from '../lib/logger';
import * as telemetry from '../telemetry';
import { detectAndLoadTerminalConfig } from './TerminalConfigParser';
import { ClaudeHookService } from './ClaudeHookService';
import { maybeAutoTrustForClaude } from './ClaudeConfigService';
import { databaseService } from './DatabaseService';
import { lifecycleScriptsService } from './LifecycleScriptsService';
import { OpenCodeHookService, OPEN_CODE_PLUGIN_FILE } from './OpenCodeHookService';
import { ptyHostService } from './ptyHostService';
import type { PtyHostLayoutState, SerializedPtyHostState } from './ptyHostProtocol';
import {
  buildProviderCliArgs,
  getProviderRuntimeCliArgs,
  parseShellArgs,
  prepareLocalDirectLaunch,
  prepareLocalShellLaunch,
  prepareSshLaunch,
  resolveProviderCommandConfig,
  type PersistentDirectLaunchRequest,
  type PersistentPtyLaunchRequest,
  type PersistentShellLaunchRequest,
  type PreparedPtyLaunch,
} from './ptyLaunch';
import { taskLifecycleService } from './TaskLifecycleService';
import { getDrizzleClient } from '../db/drizzleClient';
import { sshConnections as sshConnectionsTable } from '../db/schema';
import { PROVIDER_IDS, getProvider, type ProviderId } from '../../shared/providers/registry';
import { parsePtyId } from '../../shared/ptyId';
import { quoteShellArg } from '../utils/shellEscape';
import { agentEventService } from './AgentEventService';

const owners = new Map<string, WebContents>();
const wcDestroyedListeners = new Set<number>();
const pendingAttaches = new Map<string, { token: string; buffered: string }>();
let hostListenersRegistered = false;

const providerPtyTimers = new Map<string, number>();
const ptyProviderMap = new Map<string, ProviderId>();
const finalizedPtys = new Set<string>();

const ptyDataBuffers = new Map<string, string>();
const ptyDataTimers = new Map<string, NodeJS.Timeout>();
const PTY_DATA_FLUSH_MS = 16;
const PTY_ACTIVITY_SAMPLE_CHARS = 8_192;

type FinishCause = 'process_exit' | 'manual_kill';

function execFileAsync(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${cmd} failed: ${stderr || error.message}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function safeSendToOwner(id: string, channel: string, payload: unknown): boolean {
  const wc = owners.get(id);
  if (!wc) return false;
  try {
    if (typeof wc.isDestroyed === 'function' && wc.isDestroyed()) return false;
    wc.send(channel, payload);
    return true;
  } catch (err) {
    log.warn('ptyIpc:safeSendFailed', {
      id,
      channel,
      error: String((err as Error)?.message || err),
    });
    return false;
  }
}

function sendPtyExitGlobal(id: string): void {
  safeSendToOwner(id, 'pty:exit:global', { id });
}

function flushPtyData(id: string): void {
  const buf = ptyDataBuffers.get(id);
  if (!buf) return;
  ptyDataBuffers.delete(id);
  safeSendToOwner(id, `pty:data:${id}`, buf);
  safeSendToOwner(id, 'pty:activity', {
    id,
    chunk: buf.length <= PTY_ACTIVITY_SAMPLE_CHARS ? buf : buf.slice(-PTY_ACTIVITY_SAMPLE_CHARS),
  });
}

function clearPtyData(id: string): void {
  const timer = ptyDataTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    ptyDataTimers.delete(id);
  }
  ptyDataBuffers.delete(id);
}

function bufferedSendPtyData(id: string, chunk: string): void {
  const attach = pendingAttaches.get(id);
  if (attach) {
    attach.buffered += chunk;
    pendingAttaches.set(id, attach);
    return;
  }

  const prev = ptyDataBuffers.get(id) || '';
  ptyDataBuffers.set(id, prev + chunk);
  if (ptyDataTimers.has(id)) return;
  const timer = setTimeout(() => {
    ptyDataTimers.delete(id);
    flushPtyData(id);
  }, PTY_DATA_FLUSH_MS);
  ptyDataTimers.set(id, timer);
}

function broadcastPtyStarted(id: string): void {
  try {
    for (const window of BrowserWindow.getAllWindows()) {
      try {
        if (!window.webContents.isDestroyed()) {
          window.webContents.send('pty:started', { id });
        }
      } catch {}
    }
  } catch {}
}

function randomAttachToken(): string {
  return randomUUID();
}

function formatLaunchArgs(args: string[]): string {
  return args
    .map((arg) => {
      if (/^[A-Za-z0-9_./:=+-]+$/.test(arg)) {
        return arg;
      }
      return JSON.stringify(arg);
    })
    .join(' ');
}

function formatLaunchError(
  launch: PreparedPtyLaunch,
  error: unknown,
  providerId?: ProviderId
): string {
  const message = error instanceof Error ? error.message : String(error);
  const lines = [message];

  lines.push(`Mode: ${launch.kind}/${launch.persistentRequest.mode}`);
  if (providerId) {
    lines.push(`Provider: ${providerId}`);
  }

  lines.push(`Command: ${launch.spawn.command}`);
  if (launch.spawn.args.length > 0) {
    lines.push(`Args: ${formatLaunchArgs(launch.spawn.args)}`);
  }
  lines.push(`CWD: ${launch.spawn.cwd}`);

  return lines.join('\n');
}

function formatStartRequestError(
  options: {
    mode: 'shell' | 'direct';
    id: string;
    cwd?: string;
    shell?: string;
    providerId?: string;
    remoteConnectionId?: string;
  },
  error: unknown
): string {
  const message = error instanceof Error ? error.message : String(error);
  const lines = [message, `Mode: ${options.remoteConnectionId ? 'ssh' : 'local'}/${options.mode}`];

  if (options.providerId) {
    lines.push(`Provider: ${options.providerId}`);
  }
  if (options.shell) {
    lines.push(`Shell: ${options.shell}`);
  }
  if (options.cwd) {
    lines.push(`CWD: ${options.cwd}`);
  }
  if (options.remoteConnectionId) {
    lines.push(`Remote: ${options.remoteConnectionId}`);
  }

  return lines.join('\n');
}

function ensureOwnerDestroyedListener(wc: WebContents): void {
  if (wcDestroyedListeners.has(wc.id)) return;
  wcDestroyedListeners.add(wc.id);
  wc.once('destroyed', () => {
    wcDestroyedListeners.delete(wc.id);
    for (const [ptyId, owner] of owners.entries()) {
      if (owner !== wc) continue;
      owners.delete(ptyId);
      const shortGrace = pendingAttaches.has(ptyId);
      pendingAttaches.delete(ptyId);
      clearPtyData(ptyId);
      void ptyHostService.detach(ptyId, shortGrace).catch((error) => {
        log.warn('ptyIpc: failed to detach PTY for destroyed renderer', {
          ptyId,
          error: String(error),
        });
      });
    }
  });
}

function parseProviderPty(id: string): {
  providerId: ProviderId;
  taskId: string;
} | null {
  const parsed = parsePtyId(id);
  if (!parsed) return null;
  return { providerId: parsed.providerId, taskId: parsed.suffix };
}

function providerRunKey(providerId: ProviderId, taskId: string) {
  return `${providerId}:${taskId}`;
}

function maybeMarkProviderStart(id: string, providerId?: ProviderId) {
  finalizedPtys.delete(id);

  if (providerId && PROVIDER_IDS.includes(providerId)) {
    ptyProviderMap.set(id, providerId);
    const key = `${providerId}:${id}`;
    if (providerPtyTimers.has(key)) return;
    providerPtyTimers.set(key, Date.now());
    telemetry.capture('agent_run_start', { provider: providerId });
    return;
  }

  const storedProvider = ptyProviderMap.get(id);
  if (storedProvider) {
    const key = `${storedProvider}:${id}`;
    if (providerPtyTimers.has(key)) return;
    providerPtyTimers.set(key, Date.now());
    telemetry.capture('agent_run_start', { provider: storedProvider });
    return;
  }

  const parsed = parseProviderPty(id);
  if (!parsed) return;
  const key = providerRunKey(parsed.providerId, parsed.taskId);
  if (providerPtyTimers.has(key)) return;
  providerPtyTimers.set(key, Date.now());
  telemetry.capture('agent_run_start', { provider: parsed.providerId });
}

function maybeMarkProviderFinish(
  id: string,
  exitCode: number | null | undefined,
  signal: number | undefined,
  cause: FinishCause
) {
  if (finalizedPtys.has(id)) return;
  finalizedPtys.add(id);

  let providerId: ProviderId | undefined;
  let key: string;

  const storedProvider = ptyProviderMap.get(id);
  if (storedProvider) {
    providerId = storedProvider;
    key = `${storedProvider}:${id}`;
  } else {
    const parsed = parseProviderPty(id);
    if (!parsed) return;
    providerId = parsed.providerId;
    key = providerRunKey(parsed.providerId, parsed.taskId);
  }

  const started = providerPtyTimers.get(key);
  providerPtyTimers.delete(key);
  ptyProviderMap.delete(id);

  if (typeof exitCode !== 'number') return;

  const duration = started ? Math.max(0, Date.now() - started) : undefined;
  const wasSignaled = signal !== undefined && signal !== null;
  const outcome = exitCode !== 0 && !wasSignaled ? 'error' : 'ok';

  telemetry.capture('agent_run_finish', {
    provider: providerId,
    outcome,
    duration_ms: duration,
    cause,
  });
}

function buildScpArgs(sshArgs: string[]): string[] {
  const scpArgs: string[] = [];
  for (let i = 0; i < sshArgs.length; i++) {
    if (sshArgs[i] === '-p' && i + 1 < sshArgs.length) {
      scpArgs.push('-P', sshArgs[i + 1]);
      i++;
    } else if (
      (sshArgs[i] === '-i' || sshArgs[i] === '-o' || sshArgs[i] === '-F') &&
      i + 1 < sshArgs.length
    ) {
      scpArgs.push(sshArgs[i], sshArgs[i + 1]);
      i++;
    }
  }
  return scpArgs;
}

async function resolveShellSetup(cwd: string): Promise<string | undefined> {
  const fromCwd = lifecycleScriptsService.getShellSetup(cwd);
  if (fromCwd) return fromCwd;
  try {
    const task = await databaseService.getTaskByPath(cwd);
    const project = task ? await databaseService.getProjectById(task.projectId) : null;
    if (project?.path) return lifecycleScriptsService.getShellSetup(project.path) ?? undefined;
  } catch {}
  return undefined;
}

async function resolveSshInvocation(
  connectionId: string
): Promise<{ target: string; args: string[] }> {
  if (connectionId.startsWith('ssh-config:')) {
    const raw = connectionId.slice('ssh-config:'.length);
    let alias = raw;
    try {
      if (/%[0-9A-Fa-f]{2}/.test(raw)) {
        alias = decodeURIComponent(raw);
      }
    } catch {
      alias = raw;
    }
    if (alias) {
      return { target: alias, args: [] };
    }
  }

  const { db } = await getDrizzleClient();
  const rows = await db
    .select({
      id: sshConnectionsTable.id,
      host: sshConnectionsTable.host,
      port: sshConnectionsTable.port,
      username: sshConnectionsTable.username,
      privateKeyPath: sshConnectionsTable.privateKeyPath,
    })
    .from(sshConnectionsTable)
    .where(eq(sshConnectionsTable.id, connectionId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error(`SSH connection not found: ${connectionId}`);
  }

  const args: string[] = [];
  if (row.port && row.port !== 22) {
    args.push('-p', String(row.port));
  }
  if (row.privateKeyPath) {
    args.push('-i', row.privateKeyPath);
  }

  return {
    target: row.username ? `${row.username}@${row.host}` : row.host,
    args,
  };
}

function buildRemoteInitShellCommand(cwd: string): string {
  const posixPayload = `cd ${quoteShellArg(cwd)} && exec "\${SHELL:-/bin/sh}" -il`;
  return `/bin/sh -c ${quoteShellArg(posixPayload)}`;
}

function buildRemoteInitKeystrokes(args: {
  cwd?: string;
  provider?: { cli: string; cmd: string; installCommand?: string };
  preProviderCommands?: string[];
}): string {
  const lines: string[] = [];

  if (args.cwd) {
    lines.push(`cd ${quoteShellArg(args.cwd)}`);
  }

  if (args.preProviderCommands?.length) {
    lines.push(...args.preProviderCommands);
  }

  if (args.provider) {
    const cli = args.provider.cli;
    const install = args.provider.installCommand ? ` Install: ${args.provider.installCommand}` : '';
    const msg = `emdash: ${cli} not found on remote.${install}`;
    const providerCmd = args.provider.cmd;
    const shScript = `if command -v ${quoteShellArg(cli)} >/dev/null 2>&1; then exec ${providerCmd}; else printf '%s\\n' ${quoteShellArg(
      msg
    )}; fi`;
    lines.push(`sh -ilc ${quoteShellArg(shScript)}`);
  }

  return lines.length ? `${lines.join('\n')}\n` : '';
}

async function writeRemoteHookConfig(
  sshArgs: string[],
  sshTarget: string,
  cwd: string
): Promise<void> {
  const dir = `${cwd}/.claude`;
  const filePath = `${dir}/settings.local.json`;

  let existing: Record<string, any> = {};
  try {
    const { stdout } = await execFileAsync('ssh', [
      ...sshArgs,
      sshTarget,
      `cat ${quoteShellArg(filePath)} 2>/dev/null || echo '{}'`,
    ]);
    existing = JSON.parse(stdout.trim());
  } catch {}

  ClaudeHookService.mergeHookEntries(existing);

  const json = JSON.stringify(existing, null, 2);
  await execFileAsync('ssh', [
    ...sshArgs,
    sshTarget,
    `mkdir -p ${quoteShellArg(dir)} && printf '%s\\n' ${quoteShellArg(json)} > ${quoteShellArg(filePath)}`,
  ]);
}

async function writeRemoteOpenCodePlugin(
  sshArgs: string[],
  sshTarget: string,
  ptyId: string
): Promise<string> {
  const configDir = OpenCodeHookService.getRemoteConfigDir(ptyId);
  const pluginsDir = `${configDir}/plugins`;
  const pluginPath = `${pluginsDir}/${OPEN_CODE_PLUGIN_FILE}`;
  const pluginSource = OpenCodeHookService.getPluginSource();

  await execFileAsync('ssh', [
    ...sshArgs,
    sshTarget,
    `mkdir -p "${pluginsDir}" && printf '%s\\n' ${quoteShellArg(pluginSource)} > "${pluginPath}"`,
  ]);

  return configDir;
}

function buildRemoteProviderInvocation(args: {
  providerId: string;
  autoApprove?: boolean;
  initialPrompt?: string;
}): { cli: string; cmd: string; installCommand?: string } {
  const { providerId, autoApprove, initialPrompt } = args;
  const fallbackProvider = getProvider(providerId as ProviderId);
  const resolvedConfig = resolveProviderCommandConfig(providerId);
  const provider = resolvedConfig?.provider ?? fallbackProvider;

  const cliCommand = (
    resolvedConfig?.cli ||
    fallbackProvider?.cli ||
    providerId.toLowerCase()
  ).trim();
  const parsedCliParts = cliCommand ? parseShellArgs(cliCommand) : [cliCommand];
  const cliCheckCommand = parsedCliParts[0];

  const cliArgs = buildProviderCliArgs({
    defaultArgs: resolvedConfig?.defaultArgs ?? fallbackProvider?.defaultArgs,
    extraArgs: resolvedConfig?.extraArgs,
    autoApprove,
    autoApproveFlag: resolvedConfig?.autoApproveFlag ?? fallbackProvider?.autoApproveFlag,
    initialPrompt,
    initialPromptFlag: resolvedConfig?.initialPromptFlag ?? fallbackProvider?.initialPromptFlag,
    useKeystrokeInjection: provider?.useKeystrokeInjection,
    runtimeArgs: getProviderRuntimeCliArgs({ providerId, target: 'remote' }),
  });

  const cmdParts = [...parsedCliParts, ...cliArgs];
  const cmd = cmdParts.map(quoteShellArg).join(' ');
  return { cli: cliCheckCommand, cmd, installCommand: provider?.installCommand };
}

function pickReverseTunnelPort(ptyId: string): number {
  const hash = createHash('sha256').update(ptyId).digest();
  const value = hash.readUInt16BE(0);
  return 49152 + (value % (65535 - 49152 + 1));
}

function makePersistentShellRequest(args: {
  id: string;
  cwd?: string;
  shell?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  autoApprove?: boolean;
  remote?: { connectionId: string };
}): PersistentShellLaunchRequest {
  return {
    mode: 'shell',
    id: args.id,
    cwd: args.cwd,
    shell: args.shell,
    env: args.env,
    cols: args.cols,
    rows: args.rows,
    autoApprove: args.autoApprove,
    remoteConnectionId: args.remote?.connectionId,
  };
}

function makePersistentDirectRequest(args: {
  id: string;
  providerId: string;
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  autoApprove?: boolean;
  remote?: { connectionId: string };
}): PersistentDirectLaunchRequest {
  return {
    mode: 'direct',
    id: args.id,
    providerId: args.providerId,
    cwd: args.cwd,
    env: args.env,
    cols: args.cols,
    rows: args.rows,
    autoApprove: args.autoApprove,
    remoteConnectionId: args.remote?.connectionId,
  };
}

async function buildPreparedShellLaunch(args: {
  id: string;
  cwd?: string;
  remote?: { connectionId: string };
  shell?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  autoApprove?: boolean;
  initialPrompt?: string;
}): Promise<PreparedPtyLaunch> {
  const persistentRequest = makePersistentShellRequest(args);

  if (args.remote?.connectionId) {
    const ssh = await resolveSshInvocation(args.remote.connectionId);
    const remoteInitCommand = args.cwd ? buildRemoteInitShellCommand(args.cwd) : undefined;
    return {
      id: args.id,
      kind: 'ssh',
      spawn: prepareSshLaunch({
        id: args.id,
        target: ssh.target,
        sshArgs: ssh.args,
        remoteInitCommand,
        cols: args.cols,
        rows: args.rows,
        env: args.env,
      }),
      persistentRequest,
    };
  }

  const shellSetup = args.cwd ? await resolveShellSetup(args.cwd) : undefined;
  return {
    id: args.id,
    kind: 'local',
    spawn: prepareLocalShellLaunch({
      id: args.id,
      cwd: args.cwd,
      shell: args.shell,
      env: args.env,
      cols: args.cols,
      rows: args.rows,
      autoApprove: args.autoApprove,
      initialPrompt: args.initialPrompt,
      shellSetup,
    }),
    persistentRequest,
  };
}

async function buildPreparedDirectLaunch(args: {
  id: string;
  providerId: string;
  cwd: string;
  remote?: { connectionId: string };
  cols?: number;
  rows?: number;
  autoApprove?: boolean;
  initialPrompt?: string;
  env?: Record<string, string>;
}): Promise<PreparedPtyLaunch> {
  const persistentRequest = makePersistentDirectRequest(args);

  if (args.remote?.connectionId) {
    const ssh = await resolveSshInvocation(args.remote.connectionId);
    const remoteProvider = buildRemoteProviderInvocation({
      providerId: args.providerId,
      autoApprove: args.autoApprove,
      initialPrompt: args.initialPrompt,
    });

    const resolvedConfig = resolveProviderCommandConfig(args.providerId);
    const mergedEnv = resolvedConfig?.env ? { ...resolvedConfig.env, ...args.env } : args.env;
    const preProviderCommands: string[] = [];

    if (args.providerId === 'opencode') {
      try {
        const remoteConfigDir = await writeRemoteOpenCodePlugin(ssh.args, ssh.target, args.id);
        preProviderCommands.push(`export OPENCODE_CONFIG_DIR="${remoteConfigDir}"`);
      } catch (error) {
        log.warn('ptyIpc: failed to write remote OpenCode plugin', {
          id: args.id,
          error: String(error),
        });
      }
    }

    const hookPort = agentEventService.getPort();
    if (hookPort > 0) {
      const remotePort = pickReverseTunnelPort(args.id);
      if (args.providerId === 'claude') {
        try {
          await writeRemoteHookConfig(ssh.args, ssh.target, args.cwd);
        } catch (error) {
          log.warn('ptyIpc: failed to write remote Claude hook config', {
            id: args.id,
            error: String(error),
          });
        }
      }

      ssh.args.push('-R', `127.0.0.1:${remotePort}:127.0.0.1:${hookPort}`);
      preProviderCommands.push(
        `export EMDASH_HOOK_PORT=${quoteShellArg(String(remotePort))}`,
        `export EMDASH_HOOK_TOKEN=${quoteShellArg(agentEventService.getToken())}`,
        `export EMDASH_PTY_ID=${quoteShellArg(args.id)}`
      );
    }

    return {
      id: args.id,
      kind: 'ssh',
      spawn: prepareSshLaunch({
        id: args.id,
        target: ssh.target,
        sshArgs: ssh.args,
        remoteInitCommand: buildRemoteInitShellCommand(args.cwd),
        cols: args.cols,
        rows: args.rows,
        env: mergedEnv,
        waitForPromptData: buildRemoteInitKeystrokes({
          cwd: args.cwd,
          provider: remoteProvider,
          preProviderCommands: preProviderCommands.length ? preProviderCommands : undefined,
        }),
        waitForPromptLabel: 'ptyIpc:startDirect',
      }),
      persistentRequest,
    };
  }

  const shellSetup = await resolveShellSetup(args.cwd);
  if (args.providerId === 'claude') {
    try {
      ClaudeHookService.writeHookConfig(args.cwd);
    } catch (error) {
      log.warn('ptyIpc: failed to write local Claude hook config', {
        id: args.id,
        error: String(error),
      });
    }
  }

  if (!shellSetup) {
    const directLaunch = prepareLocalDirectLaunch({
      id: args.id,
      providerId: args.providerId,
      cwd: args.cwd,
      cols: args.cols,
      rows: args.rows,
      autoApprove: args.autoApprove,
      initialPrompt: args.initialPrompt,
      env: args.env,
    });
    if (directLaunch) {
      directLaunch.persistentRequest = persistentRequest;
      if (directLaunch.fallback) {
        directLaunch.fallback.persistentRequest = {
          mode: 'shell',
          id: args.id,
          cwd: args.cwd,
          cols: args.cols,
          rows: args.rows,
        };
      }
      return directLaunch;
    }
  }

  const resolvedConfig = resolveProviderCommandConfig(args.providerId);
  const provider = getProvider(args.providerId as ProviderId);
  const shell = resolvedConfig?.cli || provider?.cli;
  if (!shell) {
    throw new Error(`CLI path not found for provider: ${args.providerId}`);
  }

  return {
    id: args.id,
    kind: 'local',
    spawn: prepareLocalShellLaunch({
      id: args.id,
      cwd: args.cwd,
      shell,
      env: args.env,
      cols: args.cols,
      rows: args.rows,
      autoApprove: args.autoApprove,
      initialPrompt: args.initialPrompt,
      shellSetup,
    }),
    persistentRequest,
  };
}

async function buildPreparedLaunchFromPersistentRequest(
  request: PersistentPtyLaunchRequest
): Promise<PreparedPtyLaunch> {
  if (request.mode === 'shell') {
    return buildPreparedShellLaunch({
      id: request.id,
      cwd: request.cwd,
      remote: request.remoteConnectionId ? { connectionId: request.remoteConnectionId } : undefined,
      shell: request.shell,
      env: request.env,
      cols: request.cols,
      rows: request.rows,
      autoApprove: request.autoApprove,
    });
  }

  return buildPreparedDirectLaunch({
    id: request.id,
    providerId: request.providerId,
    cwd: request.cwd,
    remote: request.remoteConnectionId ? { connectionId: request.remoteConnectionId } : undefined,
    cols: request.cols,
    rows: request.rows,
    autoApprove: request.autoApprove,
    env: request.env,
  });
}

function registerHostListeners(): void {
  if (hostListenersRegistered) return;
  hostListenersRegistered = true;

  ptyHostService.on('data', ({ id, chunk }) => {
    bufferedSendPtyData(id, chunk);
  });

  ptyHostService.on('exit', ({ id, exitCode, signal }: { id: string; exitCode: number; signal?: number }) => {
    flushPtyData(id);
    clearPtyData(id);
    pendingAttaches.delete(id);
    safeSendToOwner(id, `pty:exit:${id}`, { exitCode, signal });
    sendPtyExitGlobal(id);
    owners.delete(id);
    maybeMarkProviderFinish(id, exitCode, signal, 'process_exit');
  });

  ptyHostService.on('started', ({ id }: { id: string }) => {
    broadcastPtyStarted(id);
  });

  ptyHostService.on('log', ({ level, message, meta }: any) => {
    if (level === 'error') {
      log.error(`ptyHost:${message}`, meta || {});
    } else if (level === 'warn') {
      log.warn(`ptyHost:${message}`, meta || {});
    } else {
      log.info(`ptyHost:${message}`, meta || {});
    }
  });

  ptyHostService.on('host-exit', ({ code }: { code: number }) => {
    log.warn('PTY host exited', { code });
    pendingAttaches.clear();
  });
}

async function attachPreparedLaunch(
  event: Electron.IpcMainInvokeEvent,
  launch: PreparedPtyLaunch,
  providerId?: ProviderId
): Promise<{
  ok: boolean;
  reused?: boolean;
  attachToken?: string;
  replay?: { data: string; cols: number; rows: number };
  error?: string;
}> {
  registerHostListeners();

  const wc = event.sender;
  owners.set(launch.id, wc);
  ensureOwnerDestroyedListener(wc);

  const attachToken = randomAttachToken();
  pendingAttaches.set(launch.id, { token: attachToken, buffered: '' });

  try {
    const result = await ptyHostService.createOrAttach(launch);
    if (providerId) {
      maybeMarkProviderStart(launch.id, providerId);
    } else {
      maybeMarkProviderStart(launch.id);
    }
    if (result.created) {
      broadcastPtyStarted(launch.id);
    }
    return {
      ok: true,
      reused: !result.created,
      attachToken,
      replay: result.replay,
    };
  } catch (error) {
    pendingAttaches.delete(launch.id);
    owners.delete(launch.id);
    const formattedError = formatLaunchError(launch, error, providerId);
    log.error('pty:attachPreparedLaunch failed', {
      id: launch.id,
      providerId,
      kind: launch.kind,
      mode: launch.persistentRequest.mode,
      command: launch.spawn.command,
      args: launch.spawn.args,
      cwd: launch.spawn.cwd,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      error: formattedError,
    };
  }
}

async function cleanupPtySession(id: string): Promise<void> {
  maybeMarkProviderFinish(id, null, undefined, 'manual_kill');
  pendingAttaches.delete(id);
  clearPtyData(id);
  sendPtyExitGlobal(id);
  owners.delete(id);
  await ptyHostService.kill(id);
}

async function detachPtySession(id: string): Promise<void> {
  const shortGrace = pendingAttaches.has(id);
  pendingAttaches.delete(id);
  clearPtyData(id);
  owners.delete(id);
  await ptyHostService.detach(id, shortGrace);
}

export async function revivePersistedPtys(): Promise<void> {
  registerHostListeners();

  const persisted = await ptyHostService.readPersistedState();
  if (!persisted) return;

  const reviveLaunches = [];
  for (const terminal of persisted.terminals) {
    try {
      const request: PersistentPtyLaunchRequest =
        terminal.persistentRequest.mode === 'shell'
          ? {
              ...terminal.persistentRequest,
              cols: terminal.replay.cols,
              rows: terminal.replay.rows,
            }
          : {
              ...terminal.persistentRequest,
              cols: terminal.replay.cols,
              rows: terminal.replay.rows,
            };
      const prepared = await buildPreparedLaunchFromPersistentRequest(request);
      reviveLaunches.push({
        id: prepared.id,
        kind: prepared.kind,
        spawn: prepared.spawn,
        persistentRequest: prepared.persistentRequest,
        replay: terminal.replay,
      });
    } catch (error) {
      log.warn('Failed to rebuild persisted PTY launch', {
        id: terminal.id,
        error: String(error),
      });
    }
  }

  await ptyHostService.clearPersistedState();
  if (reviveLaunches.length === 0) return;

  await ptyHostService.revive(reviveLaunches, persisted.layout);
}

export async function persistPtyHostStateForQuit(timeoutMs = 2_000): Promise<void> {
  registerHostListeners();

  try {
    const state = (await Promise.race([
      ptyHostService.serializeState(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])) as SerializedPtyHostState | null;

    if (!state || state.terminals.length === 0) {
      await ptyHostService.clearPersistedState();
      return;
    }

    await ptyHostService.writePersistedState(state);
  } catch (error) {
    log.warn('Failed to persist PTY host state on quit', {
      error: String(error),
    });
  }
}

export function registerPtyIpc(): void {
  registerHostListeners();

  ipcMain.handle(
    'pty:start',
    async (
      event,
      args: {
        id: string;
        cwd?: string;
        remote?: { connectionId: string };
        shell?: string;
        env?: Record<string, string>;
        cols?: number;
        rows?: number;
        autoApprove?: boolean;
        initialPrompt?: string;
      }
    ) => {
      if (process.env.EMDASH_DISABLE_PTY === '1') {
        return { ok: false, error: 'PTY disabled via EMDASH_DISABLE_PTY=1' };
      }

      try {
        const parsedPty = parsePtyId(args.id);
        if (parsedPty?.kind === 'main') {
          await taskLifecycleService.awaitSetup(parsedPty.suffix);
        }
        if (parsedPty) {
          maybeAutoTrustForClaude(parsedPty.providerId, args.cwd);
        }

        const launch = await buildPreparedShellLaunch(args);
        return await attachPreparedLaunch(event, launch);
      } catch (error) {
        const formattedError = formatStartRequestError(
          {
            mode: 'shell',
            id: args.id,
            cwd: args.cwd,
            shell: args.shell,
            remoteConnectionId: args.remote?.connectionId,
          },
          error
        );
        log.error('pty:start FAIL', {
          id: args.id,
          cwd: args.cwd,
          shell: args.shell,
          error: error instanceof Error ? error.message : String(error),
        });
        return { ok: false, error: formattedError };
      }
    }
  );

  ipcMain.handle(
    'pty:startDirect',
    async (
      event,
      args: {
        id: string;
        providerId: string;
        cwd: string;
        remote?: { connectionId: string };
        cols?: number;
        rows?: number;
        autoApprove?: boolean;
        initialPrompt?: string;
        env?: Record<string, string>;
      }
    ) => {
      if (process.env.EMDASH_DISABLE_PTY === '1') {
        return { ok: false, error: 'PTY disabled via EMDASH_DISABLE_PTY=1' };
      }

      try {
        const parsedPty = parsePtyId(args.id);
        if (parsedPty?.kind === 'main') {
          await taskLifecycleService.awaitSetup(parsedPty.suffix);
        }

        maybeAutoTrustForClaude(args.providerId, args.cwd);
        const launch = await buildPreparedDirectLaunch(args);
        return await attachPreparedLaunch(event, launch, args.providerId as ProviderId);
      } catch (error) {
        const formattedError = formatStartRequestError(
          {
            mode: 'direct',
            id: args.id,
            cwd: args.cwd,
            providerId: args.providerId,
            remoteConnectionId: args.remote?.connectionId,
          },
          error
        );
        log.error('pty:startDirect FAIL', {
          id: args.id,
          providerId: args.providerId,
          cwd: args.cwd,
          remoteConnectionId: args.remote?.connectionId,
          error: error instanceof Error ? error.message : String(error),
        });
        return { ok: false, error: formattedError };
      }
    }
  );

  ipcMain.handle(
    'pty:confirmAttach',
    async (_event, args: { id: string; attachToken: string }): Promise<{ ok: boolean }> => {
      const pending = pendingAttaches.get(args.id);
      if (!pending || pending.token !== args.attachToken) {
        return { ok: false };
      }

      pendingAttaches.delete(args.id);
      if (pending.buffered) {
        bufferedSendPtyData(args.id, pending.buffered);
      }
      return { ok: true };
    }
  );

  ipcMain.on('pty:input', (_event, args: { id: string; data: string }) => {
    void ptyHostService.input(args.id, args.data).catch((error) => {
      log.error('pty:input error', { id: args.id, error: String(error) });
    });

    if (args.data === '\r' || args.data === '\n') {
      const providerId = ptyProviderMap.get(args.id) || parseProviderPty(args.id)?.providerId;
      if (providerId) {
        telemetry.capture('agent_prompt_sent', { provider: providerId });
      }
    }
  });

  ipcMain.on('pty:resize', (_event, args: { id: string; cols: number; rows: number }) => {
    void ptyHostService.resize(args.id, args.cols, args.rows).catch((error) => {
      log.error('pty:resize error', {
        id: args.id,
        cols: args.cols,
        rows: args.rows,
        error: String(error),
      });
    });
  });

  ipcMain.on('pty:kill', (_event, args: { id: string }) => {
    void cleanupPtySession(args.id).catch((error) => {
      log.error('pty:kill error', { id: args.id, error: String(error) });
    });
  });

  ipcMain.on('pty:disconnect', (_event, args: { id: string }) => {
    void detachPtySession(args.id).catch((error) => {
      log.error('pty:disconnect error', { id: args.id, error: String(error) });
    });
  });

  ipcMain.handle(
    'pty:cleanupSessions',
    async (_event, args: { ids: string[] }): Promise<{
      ok: boolean;
      cleaned: number;
      failedIds: string[];
    }> => {
      const ids = Array.from(new Set((args?.ids || []).filter(Boolean)));
      const failedIds: string[] = [];

      for (const id of ids) {
        try {
          await cleanupPtySession(id);
        } catch (error) {
          failedIds.push(id);
          log.error('pty:cleanupSessions kill error', { id, error: String(error) });
        }
      }

      return {
        ok: failedIds.length === 0,
        cleaned: ids.length - failedIds.length,
        failedIds,
      };
    }
  );

  ipcMain.handle('terminal:getTheme', async () => {
    try {
      const config = detectAndLoadTerminalConfig();
      if (config) {
        return { ok: true, config };
      }
      return { ok: false, error: 'No terminal configuration found' };
    } catch (error) {
      log.error('terminal:getTheme failed', { error: String(error) });
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(
    'pty:scp-to-remote',
    async (
      _event,
      args: { connectionId: string; localPaths: string[] }
    ): Promise<{ success: boolean; remotePaths?: string[]; error?: string }> => {
      try {
        const ssh = await resolveSshInvocation(args.connectionId);
        const scpArgs = buildScpArgs(ssh.args);
        const remoteDir = '/tmp/emdash-images';

        await execFileAsync('ssh', [...ssh.args, ssh.target, `mkdir -p ${remoteDir}`]);

        const remotePaths: string[] = [];
        for (const localPath of args.localPaths) {
          const remoteName = `${randomUUID()}-${path.basename(localPath)}`;
          const remotePath = `${remoteDir}/${remoteName}`;
          await execFileAsync('scp', [...scpArgs, localPath, `${ssh.target}:${remotePath}`]);
          remotePaths.push(remotePath);
        }

        return { success: true, remotePaths };
      } catch (error) {
        log.error('pty:scp-to-remote failed', {
          connectionId: args.connectionId,
          error: String(error),
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );
}
