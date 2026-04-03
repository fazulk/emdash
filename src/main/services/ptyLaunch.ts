import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { log } from '../lib/logger';
import { PROVIDERS, type ProviderDefinition } from '@shared/providers/registry';
import { providerStatusCache } from './providerStatusCache';
import { getProviderCustomConfig } from '../settings';
import { agentEventService } from './AgentEventService';
import { OpenCodeHookService } from './OpenCodeHookService';
import { LOCALE_ENV_VARS, DEFAULT_UTF8_LOCALE, isUtf8Locale } from '../utils/locale';

export type PtySpawnPlan = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
  waitForPromptData?: string;
  waitForPromptLabel?: string;
};

export type PersistentShellLaunchRequest = {
  mode: 'shell';
  id: string;
  cwd?: string;
  shell?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  autoApprove?: boolean;
  remoteConnectionId?: string;
};

export type PersistentDirectLaunchRequest = {
  mode: 'direct';
  id: string;
  providerId: string;
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  autoApprove?: boolean;
  remoteConnectionId?: string;
};

export type PersistentPtyLaunchRequest =
  | PersistentShellLaunchRequest
  | PersistentDirectLaunchRequest;

export type PreparedPtyLaunch = {
  id: string;
  kind: 'local' | 'ssh';
  spawn: PtySpawnPlan;
  persistentRequest: PersistentPtyLaunchRequest;
  fallback?: {
    spawn: PtySpawnPlan;
    persistentRequest: PersistentPtyLaunchRequest;
    emitStarted?: boolean;
  };
};

/**
 * Environment variables to pass through for agent authentication.
 * These are passed to CLI tools during direct spawn (which skips shell config).
 */
export const AGENT_ENV_VARS = [
  'AMP_API_KEY',
  'ANTHROPIC_API_KEY',
  'AUTOHAND_API_KEY',
  'AUGMENT_SESSION_AUTH',
  'AWS_ACCESS_KEY_ID',
  'AWS_DEFAULT_REGION',
  'AWS_PROFILE',
  'AWS_REGION',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AZURE_OPENAI_API_ENDPOINT',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_KEY',
  'CODEBUFF_API_KEY',
  'COPILOT_CLI_TOKEN',
  'CURSOR_API_KEY',
  'DASHSCOPE_API_KEY',
  'FACTORY_API_KEY',
  'FORGE_API_KEY',
  'GEMINI_API_KEY',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_LOCATION',
  'GOOGLE_CLOUD_PROJECT',
  'GLM_API_KEY',
  'GLM_BASE_URL',
  'BROWSERBASE_API_KEY',
  'BROWSERBASE_PROJECT_ID',
  'ELEVENLABS_API_KEY',
  'FAL_KEY',
  'FIRECRAWL_API_KEY',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'HONCHO_API_KEY',
  'KIMI_API_KEY',
  'KIMI_BASE_URL',
  'MISTRAL_API_KEY',
  'MINIMAX_API_KEY',
  'MINIMAX_BASE_URL',
  'MINIMAX_CN_API_KEY',
  'MINIMAX_CN_BASE_URL',
  'MOONSHOT_API_KEY',
  'NO_PROXY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENROUTER_API_KEY',
  'TINKER_API_KEY',
  'VOICE_TOOLS_OPENAI_KEY',
  'WANDB_API_KEY',
] as const;

const DISPLAY_ENV_VARS = [
  'DISPLAY',
  'XAUTHORITY',
  'WAYLAND_DISPLAY',
  'XDG_RUNTIME_DIR',
  'XDG_CURRENT_DESKTOP',
  'XDG_SESSION_TYPE',
  'XDG_DATA_DIRS',
  'DBUS_SESSION_BUS_ADDRESS',
] as const;

export function getLocaleEnv(sourceEnv: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (process.platform === 'win32') {
    const localeEnv: Record<string, string> = {};
    for (const key of LOCALE_ENV_VARS) {
      const value = sourceEnv[key];
      if (value && isUtf8Locale(value)) {
        localeEnv[key] = value;
      }
    }
    return localeEnv;
  }

  const localeEnv: Record<string, string> = {};
  const lang = sourceEnv.LANG;
  const lcAll = sourceEnv.LC_ALL;
  const lcCtype = sourceEnv.LC_CTYPE;

  if (lcAll && isUtf8Locale(lcAll)) {
    localeEnv.LC_ALL = lcAll;
  }
  if (lang && isUtf8Locale(lang)) {
    localeEnv.LANG = lang;
  }
  if (lcCtype && isUtf8Locale(lcCtype)) {
    localeEnv.LC_CTYPE = lcCtype;
  }

  if (localeEnv.LC_ALL || localeEnv.LANG || localeEnv.LC_CTYPE) {
    return localeEnv;
  }

  localeEnv.LANG = DEFAULT_UTF8_LOCALE;
  localeEnv.LC_CTYPE = DEFAULT_UTF8_LOCALE;
  return localeEnv;
}

export function mergeEnvWithNormalizedLocale(
  ...envs: Array<NodeJS.ProcessEnv | undefined>
): Record<string, string> {
  const mergedEnv: NodeJS.ProcessEnv = {};

  for (const env of envs) {
    if (!env) continue;
    Object.assign(mergedEnv, env);
  }

  const localeEnv = getLocaleEnv(mergedEnv);
  for (const key of LOCALE_ENV_VARS) {
    delete mergedEnv[key];
  }

  return {
    ...mergedEnv,
    ...localeEnv,
  } as Record<string, string>;
}

function getDisplayEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of DISPLAY_ENV_VARS) {
    if (process.env[key]) {
      env[key] = process.env[key] as string;
    }
  }
  return env;
}

function getWindowsEssentialEnv(): Record<string, string> {
  const home = os.homedir();
  return {
    PATH: process.env.PATH || process.env.Path || '',
    PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC',
    SystemRoot: process.env.SystemRoot || 'C:\\Windows',
    ComSpec: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
    TEMP: process.env.TEMP || process.env.TMP || '',
    TMP: process.env.TMP || process.env.TEMP || '',
    USERPROFILE: process.env.USERPROFILE || home,
    APPDATA: process.env.APPDATA || '',
    LOCALAPPDATA: process.env.LOCALAPPDATA || '',
    HOMEDRIVE: process.env.HOMEDRIVE || '',
    HOMEPATH: process.env.HOMEPATH || '',
    USERNAME: process.env.USERNAME || os.userInfo().username,
    ProgramFiles: process.env.ProgramFiles || 'C:\\Program Files',
    'ProgramFiles(x86)': process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    ProgramData: process.env.ProgramData || 'C:\\ProgramData',
    CommonProgramFiles: process.env.CommonProgramFiles || 'C:\\Program Files\\Common Files',
    'CommonProgramFiles(x86)':
      process.env['CommonProgramFiles(x86)'] || 'C:\\Program Files (x86)\\Common Files',
    ProgramW6432: process.env.ProgramW6432 || 'C:\\Program Files',
    CommonProgramW6432: process.env.CommonProgramW6432 || 'C:\\Program Files\\Common Files',
  };
}

function applyAgentEventHookEnv(env: Record<string, string>, ptyId: string): void {
  const hookPort = agentEventService.getPort();
  if (hookPort <= 0) return;

  env['EMDASH_HOOK_PORT'] = String(hookPort);
  env['EMDASH_PTY_ID'] = ptyId;
  env['EMDASH_HOOK_TOKEN'] = agentEventService.getToken();
}

function applyOpenCodeRuntimeEnv(
  env: Record<string, string>,
  ptyId: string,
  providerId?: string
): void {
  if (providerId !== 'opencode') return;

  env['OPENCODE_CONFIG_DIR'] = OpenCodeHookService.writeLocalPlugin(ptyId);
}

function applyProviderSpecificRuntimeEnv(
  env: Record<string, string>,
  options: {
    ptyId: string;
    providerId?: string;
  }
): void {
  applyOpenCodeRuntimeEnv(env, options.ptyId, options.providerId);
}

export function applyProviderRuntimeEnv(
  env: Record<string, string>,
  options: {
    ptyId: string;
    providerId?: string;
  }
): void {
  applyAgentEventHookEnv(env, options.ptyId);
  applyProviderSpecificRuntimeEnv(env, options);
}

export type ResolvedProviderCommandConfig = {
  provider: ProviderDefinition;
  cli: string;
  resumeFlag?: string;
  defaultArgs?: string[];
  autoApproveFlag?: string;
  initialPromptFlag?: string;
  extraArgs?: string[];
  env?: Record<string, string>;
};

type ProviderCliArgsOptions = {
  resume?: boolean;
  resumeFlag?: string;
  defaultArgs?: string[];
  extraArgs?: string[];
  runtimeArgs?: string[];
  autoApprove?: boolean;
  autoApproveFlag?: string;
  initialPrompt?: string;
  initialPromptFlag?: string;
  useKeystrokeInjection?: boolean;
};

type ProviderRuntimeCliArgsOptions = {
  providerId: string;
  target?: 'local' | 'remote';
  platform?: NodeJS.Platform;
};

export function parseShellArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === '\\') {
      if (process.platform === 'win32') {
        const next = input[i + 1];
        if (inDoubleQuote && next === '"') {
          escape = true;
          continue;
        }
      } else if (!inSingleQuote) {
        escape = true;
        continue;
      }
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escape) {
    current += '\\';
  }

  if (inSingleQuote || inDoubleQuote) {
    log.warn('parseShellArgs: unclosed quote in input', { input });
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

export function resolveProviderCommandConfig(
  providerId: string
): ResolvedProviderCommandConfig | null {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (!provider) return null;

  const customConfig = getProviderCustomConfig(provider.id);

  const extraArgs =
    customConfig?.extraArgs !== undefined && customConfig.extraArgs.trim() !== ''
      ? parseShellArgs(customConfig.extraArgs.trim())
      : undefined;

  let env: Record<string, string> | undefined;
  if (customConfig?.env && typeof customConfig.env === 'object') {
    env = {};
    for (const [k, v] of Object.entries(customConfig.env)) {
      if (typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
        env[k] = v;
      }
    }
    if (Object.keys(env).length === 0) env = undefined;
  }

  return {
    provider,
    cli:
      customConfig?.cli !== undefined && customConfig.cli !== ''
        ? customConfig.cli
        : provider.cli || providerId.toLowerCase(),
    resumeFlag:
      customConfig?.resumeFlag !== undefined ? customConfig.resumeFlag : provider.resumeFlag,
    defaultArgs:
      customConfig?.defaultArgs !== undefined
        ? parseShellArgs(customConfig.defaultArgs)
        : provider.defaultArgs,
    autoApproveFlag:
      customConfig?.autoApproveFlag !== undefined
        ? customConfig.autoApproveFlag
        : provider.autoApproveFlag,
    initialPromptFlag:
      customConfig?.initialPromptFlag !== undefined
        ? customConfig.initialPromptFlag
        : provider.initialPromptFlag,
    extraArgs,
    env,
  };
}

export function buildProviderCliArgs(options: ProviderCliArgsOptions): string[] {
  const args: string[] = [];

  if (options.resume && options.resumeFlag) {
    args.push(...parseShellArgs(options.resumeFlag));
  }

  if (options.defaultArgs?.length) {
    args.push(...options.defaultArgs);
  }

  if (options.autoApprove && options.autoApproveFlag) {
    args.push(...parseShellArgs(options.autoApproveFlag));
  }

  if (options.extraArgs?.length) {
    args.push(...options.extraArgs);
  }

  if (options.runtimeArgs?.length) {
    args.push(...options.runtimeArgs);
  }

  if (
    options.initialPromptFlag !== undefined &&
    !options.useKeystrokeInjection &&
    options.initialPrompt?.trim()
  ) {
    if (options.initialPromptFlag) {
      args.push(...parseShellArgs(options.initialPromptFlag));
    }
    args.push(options.initialPrompt.trim());
  }

  return args;
}

function makePosixCodexNotifyCommand(): string[] {
  const script =
    `printf '%s' "$1" | ` +
    `curl -sf -X POST ` +
    `-H 'Content-Type: application/json' ` +
    `-H "X-Emdash-Token: $EMDASH_HOOK_TOKEN" ` +
    `-H "X-Emdash-Pty-Id: $EMDASH_PTY_ID" ` +
    `-H 'X-Emdash-Event-Type: notification' ` +
    `-d @- ` +
    `"http://127.0.0.1:$EMDASH_HOOK_PORT/hook" || true`;

  return ['sh', '-lc', script, 'sh'];
}

function ensureWindowsCodexNotifyScript(): string {
  const scriptPath = path.join(os.tmpdir(), 'emdash-codex-notify.ps1');
  const script = [
    'param([string]$payload)',
    'try {',
    '  Invoke-WebRequest -UseBasicParsing -Method POST ' +
      "-Uri ('http://127.0.0.1:' + $env:EMDASH_HOOK_PORT + '/hook') " +
      '-Headers @{ ' +
      "'Content-Type' = 'application/json'; " +
      "'X-Emdash-Token' = $env:EMDASH_HOOK_TOKEN; " +
      "'X-Emdash-Pty-Id' = $env:EMDASH_PTY_ID; " +
      "'X-Emdash-Event-Type' = 'notification' " +
      '} -Body $payload | Out-Null',
    '} catch {',
    '  exit 0',
    '}',
    '',
  ].join('\n');

  try {
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, script);
  } catch (err) {
    log.warn('ptyLaunch: failed to write Codex Windows notify script', {
      path: scriptPath,
      error: String(err),
    });
  }

  return scriptPath;
}

function makeWindowsCodexNotifyCommand(): string[] {
  return ['powershell.exe', '-NoProfile', '-File', ensureWindowsCodexNotifyScript()];
}

function makeCodexNotifyConfigValue(target: 'local' | 'remote', platform: NodeJS.Platform): string {
  const notifyCommand =
    target === 'remote' || platform !== 'win32'
      ? makePosixCodexNotifyCommand()
      : makeWindowsCodexNotifyCommand();

  return `notify=${JSON.stringify(notifyCommand)}`;
}

export function getProviderRuntimeCliArgs(options: ProviderRuntimeCliArgsOptions): string[] {
  const { providerId, target = 'local', platform = process.platform } = options;

  if (providerId !== 'codex') {
    return [];
  }

  if (agentEventService.getPort() <= 0) {
    return [];
  }

  return ['-c', makeCodexNotifyConfigValue(target, platform)];
}

const resolvedCommandPathCache = new Map<string, string | null>();

export function resolveCommandPath(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) return null;

  const pathLike =
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.startsWith('.') ||
    /^[A-Za-z]:/.test(trimmed);

  const isExecutableFile = (candidate: string): boolean => {
    try {
      const stat = fs.statSync(candidate);
      if (!stat.isFile()) return false;
      if (process.platform === 'win32') return true;
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };

  const appendWindowsExecutableExts = (base: string): string[] => {
    if (process.platform !== 'win32') return [base];

    if (path.extname(base)) return [base];

    const pathExt = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD';
    const exts = pathExt
      .split(';')
      .map((ext) => ext.trim())
      .filter(Boolean);
    return [base, ...exts.map((ext) => `${base}${ext.toLowerCase()}`)];
  };

  const resolveFromCandidates = (bases: string[], makeAbsolute: boolean): string | null => {
    for (const base of bases) {
      const candidates = appendWindowsExecutableExts(base);
      for (const candidate of candidates) {
        const target = makeAbsolute ? path.resolve(candidate) : candidate;
        if (isExecutableFile(target)) {
          return target;
        }
      }
    }
    return null;
  };

  if (pathLike) {
    return resolveFromCandidates([trimmed], true);
  }

  const pathEnv = process.env.PATH;
  if (!pathEnv) return null;

  const pathDirs = pathEnv.split(path.delimiter).filter(Boolean);
  const pathCandidates = pathDirs.map((dir) => path.join(dir, trimmed));
  return resolveFromCandidates(pathCandidates, false);
}

export function resolveCommandPathCached(command: string): string | null {
  if (resolvedCommandPathCache.has(command)) {
    return resolvedCommandPathCache.get(command) ?? null;
  }
  const resolved = resolveCommandPath(command);
  resolvedCommandPathCache.set(command, resolved);
  return resolved;
}

export function parseCustomCliForDirectSpawn(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  if (process.platform !== 'win32') {
    return parseShellArgs(trimmed);
  }

  if ((/^[A-Za-z]:\\/.test(trimmed) || /^\\\\/.test(trimmed)) && !/\s/.test(trimmed)) {
    return [trimmed];
  }

  const quotedAbsolutePath = trimmed.match(/^"([A-Za-z]:\\[^"]+)"$/);
  if (quotedAbsolutePath) {
    return [quotedAbsolutePath[1]];
  }
  const singleQuotedAbsolutePath = trimmed.match(/^'([A-Za-z]:\\[^']+)'$/);
  if (singleQuotedAbsolutePath) {
    return [singleQuotedAbsolutePath[1]];
  }

  return parseShellArgs(trimmed);
}

export function needsShellResolution(command: string): boolean {
  return /[|&;<>()$`]/.test(command);
}

function resolveWindowsPtySpawn(
  command: string,
  args: string[]
): { command: string; args: string[] } {
  if (process.platform !== 'win32') return { command, args };

  const quoteForCmdExe = (input: string): string => {
    if (input.length === 0) return '""';
    if (!/[\s"^&|<>()%!]/.test(input)) return input;
    return `"${input
      .replace(/%/g, '%%')
      .replace(/!/g, '^!')
      .replace(/(["^&|<>()])/g, '^$1')}"`;
  };

  const ext = path.extname(command).toLowerCase();
  if (ext === '.cmd' || ext === '.bat') {
    const comspec = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    const fullCommandString = [command, ...args].map(quoteForCmdExe).join(' ');
    return { command: comspec, args: ['/d', '/s', '/c', fullCommandString] };
  }
  if (ext === '.ps1') {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', command, ...args],
    };
  }

  return { command, args };
}

function quoteForPosixSingleQuotes(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildDirectSpawnBaseEnv(): Record<string, string> {
  const env: Record<string, string> = {
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'emdash',
    HOME: process.env.HOME || os.homedir(),
    USER: process.env.USER || os.userInfo().username,
    PATH: process.env.PATH || process.env.Path || '',
    ...getLocaleEnv(),
    ...(process.env.TMPDIR && { TMPDIR: process.env.TMPDIR }),
    ...getDisplayEnv(),
    ...(process.env.SSH_AUTH_SOCK && { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK }),
    ...(process.platform === 'win32' ? getWindowsEssentialEnv() : {}),
  };

  for (const key of AGENT_ENV_VARS) {
    if (process.env[key]) {
      env[key] = process.env[key] as string;
    }
  }

  return env;
}

function buildShellBaseEnv(defaultShell: string, env?: NodeJS.ProcessEnv): Record<string, string> {
  return mergeEnvWithNormalizedLocale({
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'emdash',
    HOME: process.env.HOME || os.homedir(),
    USER: process.env.USER || os.userInfo().username,
    SHELL: process.env.SHELL || defaultShell,
    ...(process.platform === 'win32' ? getWindowsEssentialEnv() : {}),
    ...(process.env.TMPDIR && { TMPDIR: process.env.TMPDIR }),
    ...(process.env.DISPLAY && { DISPLAY: process.env.DISPLAY }),
    ...getDisplayEnv(),
    ...(process.env.SSH_AUTH_SOCK && { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK }),
    ...(env || {}),
  });
}

export function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.ComSpec || 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

function resolveWindowsShellCommand(shell: string | undefined, defaultShell: string): string {
  let useShell = shell || defaultShell;

  if (process.platform === 'win32' && shell && !shell.includes('\\') && !shell.includes('/')) {
    try {
      const { execSync } = require('node:child_process') as typeof import('node:child_process');

      let resolved = '';
      try {
        resolved = execSync(`where ${shell}.cmd`, { encoding: 'utf8' })
          .trim()
          .split('\n')[0]
          .replace(/\r/g, '')
          .trim();
      } catch {
        resolved = execSync(`where ${shell}`, { encoding: 'utf8' })
          .trim()
          .split('\n')[0]
          .replace(/\r/g, '')
          .trim();
      }

      if (resolved && !resolved.match(/\.(exe|cmd|bat)$/i)) {
        const cmdPath = `${resolved}.cmd`;
        if (fs.existsSync(cmdPath)) {
          resolved = cmdPath;
        }
      }

      if (resolved) {
        useShell = resolved;
      }
    } catch {
      // fall back to original shell name
    }
  }

  return useShell;
}

export function prepareLocalShellLaunch(options: {
  id: string;
  cwd?: string;
  shell?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  autoApprove?: boolean;
  initialPrompt?: string;
  shellSetup?: string;
}): PtySpawnPlan {
  const {
    id,
    cwd,
    shell,
    env,
    cols = 80,
    rows = 24,
    autoApprove,
    initialPrompt,
    shellSetup,
  } = options;

  const defaultShell = getDefaultShell();
  let useShell = resolveWindowsShellCommand(shell, defaultShell);
  const useCwd = cwd || os.homedir();
  const useEnv = buildShellBaseEnv(defaultShell, env);

  applyAgentEventHookEnv(useEnv, id);

  const args: string[] = [];
  if (process.platform !== 'win32') {
    try {
      const base = String(useShell).split('/').pop() || '';
      const baseLower = base.toLowerCase();
      const provider = PROVIDERS.find((p) => p.cli === baseLower);

      if (provider) {
        const resolvedConfig = resolveProviderCommandConfig(provider.id);
        const resolvedCli = resolvedConfig?.cli || provider.cli || baseLower;
        applyProviderSpecificRuntimeEnv(useEnv, { ptyId: id, providerId: provider.id });

        const cliArgs = buildProviderCliArgs({
          defaultArgs: resolvedConfig?.defaultArgs,
          extraArgs: resolvedConfig?.extraArgs,
          runtimeArgs: getProviderRuntimeCliArgs({ providerId: provider.id }),
          autoApprove,
          autoApproveFlag: resolvedConfig?.autoApproveFlag,
          initialPrompt,
          initialPromptFlag: resolvedConfig?.initialPromptFlag,
          useKeystrokeInjection: provider.useKeystrokeInjection,
        });

        if (resolvedConfig?.env) {
          for (const [k, v] of Object.entries(resolvedConfig.env)) {
            if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && typeof v === 'string') {
              useEnv[k] = v;
            }
          }
        }

        const commandString =
          cliArgs.length > 0
            ? `${resolvedCli} ${cliArgs
                .map((arg) => (/[\s'"\\$`\n\r\t]/.test(arg) ? quoteForPosixSingleQuotes(arg) : arg))
                .join(' ')}`
            : resolvedCli;

        const shellBase = (defaultShell.split('/').pop() || '').toLowerCase();
        const resumeShell =
          shellBase === 'fish'
            ? `${quoteForPosixSingleQuotes(defaultShell)} -i -l`
            : `${quoteForPosixSingleQuotes(defaultShell)} -il`;
        const chainCommand = shellSetup
          ? `${shellSetup} && ${commandString}; exec ${resumeShell}`
          : `${commandString}; exec ${resumeShell}`;

        useShell = defaultShell;
        if (shellBase === 'zsh' || shellBase === 'bash') args.push('-lic', chainCommand);
        else if (shellBase === 'fish') args.push('-l', '-i', '-c', chainCommand);
        else if (shellBase === 'sh') args.push('-lc', chainCommand);
        else args.push('-c', chainCommand);
      } else {
        if (shellSetup) {
          const resumeShell =
            baseLower === 'fish'
              ? `${quoteForPosixSingleQuotes(useShell)} -i -l`
              : `${quoteForPosixSingleQuotes(useShell)} -il`;
          if (baseLower === 'fish') {
            args.push('-l', '-i', '-c', `${shellSetup}; exec ${resumeShell}`);
          } else {
            const cFlag = baseLower === 'sh' ? '-lc' : '-lic';
            args.push(cFlag, `${shellSetup}; exec ${resumeShell}`);
          }
        } else if (baseLower === 'fish') {
          args.push('-i', '-l');
        } else {
          args.push(baseLower === 'zsh' || baseLower === 'bash' || baseLower === 'sh' ? '-il' : '-i');
        }
      }
    } catch {
      // fall back to spawning the shell directly
    }
  }

  const spawnSpec = resolveWindowsPtySpawn(useShell, args);
  return {
    command: spawnSpec.command,
    args: spawnSpec.args,
    cwd: useCwd,
    env: useEnv,
    cols,
    rows,
  };
}

export function prepareLocalDirectLaunch(options: {
  id: string;
  providerId: string;
  cwd: string;
  cols?: number;
  rows?: number;
  autoApprove?: boolean;
  initialPrompt?: string;
  env?: Record<string, string>;
}): PreparedPtyLaunch | null {
  const {
    id,
    providerId,
    cwd,
    cols = 120,
    rows = 32,
    autoApprove,
    initialPrompt,
    env,
  } = options;

  const resolvedConfig = resolveProviderCommandConfig(providerId);
  const provider = resolvedConfig?.provider;
  const status = providerStatusCache.get(providerId);
  if (!status?.installed || !status?.path) {
    log.warn('ptyLaunch: direct spawn unavailable, CLI path missing', { providerId });
    return null;
  }

  let cliPath = status.path;
  if (provider && resolvedConfig && resolvedConfig.cli !== provider.cli) {
    const cliParts = parseCustomCliForDirectSpawn(resolvedConfig.cli);
    if (cliParts.length !== 1) {
      log.info('ptyLaunch: custom CLI requires shell parsing', {
        providerId,
        cli: resolvedConfig.cli,
      });
      return null;
    }

    const customCommand = cliParts[0];
    if (needsShellResolution(customCommand)) {
      log.info('ptyLaunch: custom CLI requires shell resolution', {
        providerId,
        cli: resolvedConfig.cli,
      });
      return null;
    }

    const resolvedCustomPath = resolveCommandPathCached(customCommand);
    if (!resolvedCustomPath) {
      log.info('ptyLaunch: custom CLI not directly executable', {
        providerId,
        cli: resolvedConfig.cli,
      });
      return null;
    }

    cliPath = resolvedCustomPath;
  }

  const cliArgs: string[] = [];
  if (provider && resolvedConfig) {
    cliArgs.push(
      ...buildProviderCliArgs({
        defaultArgs: resolvedConfig.defaultArgs,
        extraArgs: resolvedConfig.extraArgs,
        runtimeArgs: getProviderRuntimeCliArgs({ providerId }),
        autoApprove,
        autoApproveFlag: resolvedConfig.autoApproveFlag,
        initialPrompt,
        initialPromptFlag: resolvedConfig.initialPromptFlag,
        useKeystrokeInjection: provider.useKeystrokeInjection,
      })
    );
  }

  const useEnv = buildDirectSpawnBaseEnv();
  if (resolvedConfig?.env) {
    for (const [key, value] of Object.entries(resolvedConfig.env)) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof value === 'string') {
        useEnv[key] = value;
      }
    }
  }

  if (env) {
    for (const [key, value] of Object.entries(env)) {
      if (!key.startsWith('EMDASH_')) continue;
      if (typeof value === 'string') {
        useEnv[key] = value;
      }
    }
  }

  applyProviderRuntimeEnv(useEnv, { ptyId: id, providerId });

  const spawnSpec = resolveWindowsPtySpawn(cliPath, cliArgs);
  return {
    id,
    kind: 'local',
    spawn: {
      command: spawnSpec.command,
      args: spawnSpec.args,
      cwd,
      env: useEnv,
      cols,
      rows,
    },
    persistentRequest: {
      mode: 'direct',
      id,
      providerId,
      cwd,
      env,
      cols,
      rows,
      autoApprove,
    },
    fallback: {
      spawn: prepareLocalShellLaunch({ id, cwd, cols, rows }),
      persistentRequest: {
        mode: 'shell',
        id,
        cwd,
        cols,
        rows,
      },
      emitStarted: true,
    },
  };
}

export function prepareSshLaunch(options: {
  id: string;
  target: string;
  sshArgs?: string[];
  remoteInitCommand?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  waitForPromptData?: string;
  waitForPromptLabel?: string;
}): PtySpawnPlan {
  const {
    id,
    target,
    sshArgs = [],
    remoteInitCommand,
    cols = 120,
    rows = 32,
    env,
    waitForPromptData,
    waitForPromptLabel,
  } = options;

  const useEnv = buildDirectSpawnBaseEnv();
  if (env) {
    for (const [key, value] of Object.entries(env)) {
      if (!key.startsWith('EMDASH_')) continue;
      if (typeof value === 'string') {
        useEnv[key] = value;
      }
    }
  }

  const args: string[] = ['-tt', ...sshArgs, target];
  if (typeof remoteInitCommand === 'string' && remoteInitCommand.trim().length > 0) {
    args.push(remoteInitCommand);
  }

  let sshCommand = 'ssh';
  if (process.platform === 'win32') {
    const resolved = resolveCommandPathCached('ssh');
    if (!resolved) {
      throw new Error(
        'SSH client not found. Install OpenSSH Client via Windows Settings → Apps → Optional Features, or install Git for Windows.'
      );
    }
    sshCommand = resolved;
  }

  const spawnSpec = resolveWindowsPtySpawn(sshCommand, args);
  return {
    command: spawnSpec.command,
    args: spawnSpec.args,
    cwd: process.env.HOME || os.homedir(),
    env: useEnv,
    cols,
    rows,
    waitForPromptData,
    waitForPromptLabel,
  };
}
