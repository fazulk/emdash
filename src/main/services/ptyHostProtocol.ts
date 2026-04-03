import type { PreparedPtyLaunch, PersistentPtyLaunchRequest, PtySpawnPlan } from './ptyLaunch';

export type PtyReplayState = {
  data: string;
  cols: number;
  rows: number;
};

export type SerializedPtyState = {
  id: string;
  kind: 'local' | 'ssh';
  persistentRequest: PersistentPtyLaunchRequest;
  replay: PtyReplayState;
};

export type SerializedPtyHostState = {
  version: 1;
  savedAt: string;
  layout: PtyHostLayoutState;
  terminals: SerializedPtyState[];
};

export type PtyHostLayoutState = {
  attachedIds: string[];
  detachedIds: string[];
};

export type PtyHostReviveLaunch = {
  id: string;
  kind: 'local' | 'ssh';
  spawn: PtySpawnPlan;
  persistentRequest: PersistentPtyLaunchRequest;
  replay?: PtyReplayState;
};

export type PtyHostRequest =
  | {
      requestId: string;
      type: 'createOrAttach';
      payload: {
        launch: PreparedPtyLaunch;
      };
    }
  | {
      requestId: string;
      type: 'detach';
      payload: {
        id: string;
        shortGrace?: boolean;
      };
    }
  | {
      requestId: string;
      type: 'kill';
      payload: {
        id: string;
      };
    }
  | {
      requestId: string;
      type: 'killMany';
      payload: {
        ids: string[];
      };
    }
  | {
      requestId: string;
      type: 'input';
      payload: {
        id: string;
        data: string;
      };
    }
  | {
      requestId: string;
      type: 'resize';
      payload: {
        id: string;
        cols: number;
        rows: number;
      };
    }
  | {
      requestId: string;
      type: 'serializeState';
      payload: Record<string, never>;
    }
  | {
      requestId: string;
      type: 'revive';
      payload: {
        layout?: PtyHostLayoutState;
        terminals: PtyHostReviveLaunch[];
      };
    }
  | {
      requestId: string;
      type: 'getActivePtyInfo';
      payload: Record<string, never>;
    }
  | {
      requestId: string;
      type: 'getLayout';
      payload: Record<string, never>;
    }
  | {
      requestId: string;
      type: 'setLayout';
      payload: {
        layout: PtyHostLayoutState;
      };
    };

export type PtyHostResponse =
  | {
      requestId: string;
      ok: true;
      result:
        | {
            id: string;
            created: boolean;
            replay: PtyReplayState;
          }
        | {
            killed: number;
          }
        | {
            layout: PtyHostLayoutState;
          }
        | {
            state: SerializedPtyHostState;
          }
        | {
            revivedIds: string[];
          }
        | {
            active: Array<{
              ptyId: string;
              pid: number | null;
              kind: 'local' | 'ssh';
              cwd?: string;
            }>;
          }
        | {
            ok: true;
          };
    }
  | {
      requestId: string;
      ok: false;
      error: string;
    };

export type PtyHostEvent =
  | {
      type: 'data';
      payload: {
        id: string;
        chunk: string;
      };
    }
  | {
      type: 'exit';
      payload: {
        id: string;
        exitCode: number;
        signal?: number;
      };
    }
  | {
      type: 'started';
      payload: {
        id: string;
      };
    }
  | {
      type: 'log';
      payload: {
        level: 'info' | 'warn' | 'error';
        message: string;
        meta?: Record<string, unknown>;
      };
    };

export type PtyHostMessage = PtyHostRequest | PtyHostResponse | PtyHostEvent;
