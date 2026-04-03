import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getProviderStatusMock = vi.fn();
const getProviderCustomConfigMock = vi.fn((_providerId?: string) => undefined);

vi.mock('../../main/services/providerStatusCache', () => ({
  providerStatusCache: {
    get: (providerId: string) => getProviderStatusMock(providerId),
  },
}));

vi.mock('../../main/settings', () => ({
  getProviderCustomConfig: (providerId: string) => getProviderCustomConfigMock(providerId),
}));

vi.mock('../../main/services/AgentEventService', () => ({
  agentEventService: {
    getPort: vi.fn(() => 0),
    getToken: vi.fn(() => 'hook-token'),
  },
}));

vi.mock('../../main/services/OpenCodeHookService', () => ({
  OpenCodeHookService: {
    writeLocalPlugin: vi.fn(() => '/tmp/opencode'),
  },
}));

vi.mock('../../main/lib/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('prepareLocalDirectLaunch', () => {
  const originalPath = process.env.PATH;
  let tempDir: string;
  let cwd: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emdash-ptylaunch-'));
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'emdash-cwd-'));
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('re-resolves a stale cached provider path before direct spawn', async () => {
    const executable = path.join(tempDir, 'codex');
    fs.writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    fs.chmodSync(executable, 0o755);
    process.env.PATH = `${tempDir}${path.delimiter}${originalPath ?? ''}`;
    getProviderStatusMock.mockReturnValue({
      installed: true,
      path: '/tmp/does-not-exist/codex',
      lastChecked: Date.now(),
    });

    vi.resetModules();
    const { prepareLocalDirectLaunch } = await import('../../main/services/ptyLaunch');
    const launch = prepareLocalDirectLaunch({
      id: 'codex-task',
      providerId: 'codex',
      cwd,
    });

    expect(launch?.spawn.command).toBe(executable);
  });

  it('falls back to shell launch when the cached provider path is stale and cannot be re-resolved', async () => {
    process.env.PATH = tempDir;
    getProviderStatusMock.mockReturnValue({
      installed: true,
      path: '/tmp/does-not-exist/codex',
      lastChecked: Date.now(),
    });

    vi.resetModules();
    const { prepareLocalDirectLaunch } = await import('../../main/services/ptyLaunch');
    const launch = prepareLocalDirectLaunch({
      id: 'codex-task',
      providerId: 'codex',
      cwd,
    });

    expect(launch).toBeNull();
  });
});
