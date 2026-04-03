import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { app, utilityProcess, type UtilityProcess } from 'electron';
import { log } from '../lib/logger';
import type {
  PtyHostEvent,
  PtyHostLayoutState,
  PtyHostMessage,
  PtyHostRequest,
  PtyHostResponse,
  PtyHostReviveLaunch,
  SerializedPtyHostState,
} from './ptyHostProtocol';
import type { PreparedPtyLaunch } from './ptyLaunch';

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

class PtyHostService extends EventEmitter {
  private host: UtilityProcess | null = null;
  private pending = new Map<string, PendingRequest>();
  private startPromise: Promise<void> | null = null;
  private readonly statePath = path.join(app.getPath('userData'), 'pty-host-state.json');

  private hostEntryPath(): string {
    return path.join(__dirname, 'ptyHostProcess.js');
  }

  private wireHost(host: UtilityProcess): void {
    host.on('message', (message: PtyHostMessage) => {
      if (!message || typeof message !== 'object') return;
      if ('requestId' in message && typeof message.requestId === 'string') {
        const pending = this.pending.get(message.requestId);
        if (!pending) return;
        this.pending.delete(message.requestId);
        const response = message as PtyHostResponse;
        if (response.ok) {
          pending.resolve(response.result);
        } else {
          pending.reject(new Error(response.error));
        }
        return;
      }

      if ('type' in message) {
        this.emit((message as PtyHostEvent).type, (message as PtyHostEvent).payload);
      }
    });

    host.on('exit', (code) => {
      const isCurrent = this.host === host;
      if (isCurrent) {
        this.host = null;
      }

      for (const pending of this.pending.values()) {
        pending.reject(new Error(`PTY host exited with code ${code}`));
      }
      this.pending.clear();

      this.emit('host-exit', { code });
    });

    host.stdout?.on('data', (chunk) => {
      log.info('ptyHost:stdout', { chunk: chunk.toString() });
    });
    host.stderr?.on('data', (chunk) => {
      log.warn('ptyHost:stderr', { chunk: chunk.toString() });
    });
  }

  async ensureStarted(): Promise<void> {
    if (this.host) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = new Promise<void>((resolve, reject) => {
      try {
        const host = utilityProcess.fork(this.hostEntryPath(), [], {
          serviceName: 'emdash-pty-host',
        });
        this.host = host;
        this.wireHost(host);
        host.once('spawn', () => resolve());
        host.once('exit', (code) => {
          if (this.host === host) {
            this.host = null;
          }
          reject(new Error(`PTY host exited before becoming ready (code ${code})`));
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }).finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  private async request<T extends PtyHostRequest['type']>(
    type: T,
    payload: Extract<PtyHostRequest, { type: T }>['payload']
  ): Promise<any> {
    await this.ensureStarted();
    const host = this.host;
    if (!host) {
      throw new Error('PTY host is not running');
    }

    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const request = {
      requestId,
      type,
      payload,
    } as Extract<PtyHostRequest, { type: T }>;

    return new Promise<any>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      try {
        host.postMessage(request);
      } catch (error) {
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  createOrAttach(launch: PreparedPtyLaunch): Promise<{
    id: string;
    created: boolean;
    replay: { data: string; cols: number; rows: number };
  }> {
    return this.request('createOrAttach', { launch });
  }

  detach(id: string, shortGrace = false): Promise<void> {
    return this.request('detach', { id, shortGrace }).then(() => undefined);
  }

  kill(id: string): Promise<void> {
    return this.request('kill', { id }).then(() => undefined);
  }

  killMany(ids: string[]): Promise<{ killed: number }> {
    return this.request('killMany', { ids });
  }

  input(id: string, data: string): Promise<void> {
    return this.request('input', { id, data }).then(() => undefined);
  }

  resize(id: string, cols: number, rows: number): Promise<void> {
    return this.request('resize', { id, cols, rows }).then(() => undefined);
  }

  getActivePtyInfo(): Promise<
    Array<{
      ptyId: string;
      pid: number | null;
      kind: 'local' | 'ssh';
      cwd?: string;
    }>
  > {
    return this.request('getActivePtyInfo', {}).then((result) => result.active);
  }

  getLayout(): Promise<PtyHostLayoutState> {
    return this.request('getLayout', {}).then((result) => result.layout);
  }

  setLayout(layout: PtyHostLayoutState): Promise<PtyHostLayoutState> {
    return this.request('setLayout', { layout }).then((result) => result.layout);
  }

  serializeState(): Promise<SerializedPtyHostState> {
    return this.request('serializeState', {}).then((result) => result.state);
  }

  revive(terminals: PtyHostReviveLaunch[], layout?: PtyHostLayoutState): Promise<string[]> {
    return this.request('revive', { terminals, layout }).then((result) => result.revivedIds);
  }

  async readPersistedState(): Promise<SerializedPtyHostState | null> {
    try {
      const content = await fs.readFile(this.statePath, 'utf8');
      const parsed = JSON.parse(content) as SerializedPtyHostState;
      if (parsed?.version !== 1 || !Array.isArray(parsed.terminals)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async writePersistedState(state: SerializedPtyHostState): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(state), 'utf8');
  }

  async clearPersistedState(): Promise<void> {
    try {
      await fs.rm(this.statePath, { force: true });
    } catch {}
  }
}

export const ptyHostService = new PtyHostService();
