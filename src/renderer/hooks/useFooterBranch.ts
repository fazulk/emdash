import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseFooterBranchArgs {
  taskPath?: string | null;
  taskId?: string | null;
  fallbackBranch?: string | null;
}

const normalizeBranch = (branch?: string | null): string | null => {
  const trimmed = branch?.trim();
  return trimmed ? trimmed : null;
};

export function useFooterBranch({
  taskPath,
  taskId,
  fallbackBranch,
}: UseFooterBranchArgs): string | null {
  const normalizedPath = taskPath?.trim() || null;
  const normalizedFallbackBranch = useMemo(() => normalizeBranch(fallbackBranch), [fallbackBranch]);
  const [liveBranch, setLiveBranch] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refreshBranch = useCallback(async () => {
    if (!normalizedPath) {
      setLiveBranch(null);
      return;
    }

    const requestId = ++requestIdRef.current;

    try {
      const result = await window.electronAPI.getBranchStatus({
        taskPath: normalizedPath,
        taskId: taskId || undefined,
      });

      if (requestIdRef.current !== requestId) return;

      setLiveBranch(result?.success ? normalizeBranch(result.branch) : null);
    } catch {
      if (requestIdRef.current !== requestId) return;
      setLiveBranch(null);
    }
  }, [normalizedPath, taskId]);

  useEffect(() => {
    requestIdRef.current += 1;
    setLiveBranch(null);
    void refreshBranch();
  }, [refreshBranch]);

  useEffect(() => {
    if (!normalizedPath) return;

    const watchArg = {
      taskPath: normalizedPath,
      taskId: taskId || undefined,
    };

    let disposed = false;
    let offStatusChanged: (() => void) | undefined;
    let watchId: string | undefined;

    offStatusChanged = window.electronAPI.onGitStatusChanged?.((event) => {
      if (event?.taskPath !== normalizedPath || disposed) return;
      void refreshBranch();
    });

    const watchPromise = window.electronAPI.watchGitStatus?.(watchArg);
    if (watchPromise) {
      void watchPromise
        .then((result) => {
          if (disposed || !result?.success) return;
          watchId = result.watchId;
        })
        .catch(() => {});
    }

    return () => {
      disposed = true;
      offStatusChanged?.();
      const unwatchPromise = window.electronAPI.unwatchGitStatus?.(watchArg, watchId);
      if (unwatchPromise) {
        void unwatchPromise.catch(() => {});
      }
    };
  }, [normalizedPath, refreshBranch, taskId]);

  return liveBranch ?? normalizedFallbackBranch;
}
