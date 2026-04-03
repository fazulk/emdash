import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** Long-running git actions that should lock staging/revert across the diff viewer and sidebar. */
export type GitWorkspaceOperation = 'commit' | 'commitAndPush' | 'push' | 'pull' | 'undo';

type BusyMap = Partial<Record<string, GitWorkspaceOperation>>;

type GitWorkspaceBusyContextValue = {
  busyByPath: BusyMap;
  beginOperation: (taskPath: string, operation: GitWorkspaceOperation) => void;
  endOperation: (taskPath: string) => void;
};

const GitWorkspaceBusyContext = createContext<GitWorkspaceBusyContextValue | null>(null);

export function GitWorkspaceBusyProvider({ children }: { children: ReactNode }) {
  const [busyByPath, setBusyByPath] = useState<BusyMap>({});

  const beginOperation = useCallback((taskPath: string, operation: GitWorkspaceOperation) => {
    setBusyByPath((prev) => ({ ...prev, [taskPath]: operation }));
  }, []);

  const endOperation = useCallback((taskPath: string) => {
    setBusyByPath((prev) => {
      if (prev[taskPath] === undefined) return prev;
      const next = { ...prev };
      delete next[taskPath];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ busyByPath, beginOperation, endOperation }),
    [busyByPath, beginOperation, endOperation]
  );

  return (
    <GitWorkspaceBusyContext.Provider value={value}>{children}</GitWorkspaceBusyContext.Provider>
  );
}

export function useGitWorkspaceBusyForTask(taskPath: string | undefined) {
  const ctx = useContext(GitWorkspaceBusyContext);

  const operation =
    taskPath && ctx ? (ctx.busyByPath[taskPath] ?? null) : null;

  const beginOperation = useCallback(
    (op: GitWorkspaceOperation) => {
      if (!taskPath || !ctx) return;
      ctx.beginOperation(taskPath, op);
    },
    [taskPath, ctx]
  );

  const endOperation = useCallback(() => {
    if (!taskPath || !ctx) return;
    ctx.endOperation(taskPath);
  }, [taskPath, ctx]);

  const isLocked = operation !== null;

  return { operation, beginOperation, endOperation, isLocked };
}
