import type { CheckRunsStatus, CheckRun } from './checkRunStatus';
import { buildCheckRunsStatus } from './checkRunStatus';

type Listener = (status: CheckRunsStatus | null) => void;

type CheckRunsQuery = {
  taskPath: string;
  prNumber?: number;
};

type CheckRunsSubscription = {
  query: CheckRunsQuery;
  listeners: Set<Listener>;
};

const cache = new Map<string, CheckRunsStatus | null>();
const listeners = new Map<string, CheckRunsSubscription>();
const pending = new Map<string, Promise<CheckRunsStatus | null>>();

function getCheckRunsKey({ taskPath, prNumber }: CheckRunsQuery): string {
  return `${taskPath}::${prNumber ?? 'none'}`;
}

async function fetchCheckRuns({ taskPath, prNumber }: CheckRunsQuery): Promise<CheckRunsStatus | null> {
  try {
    const res = await window.electronAPI.getCheckRuns({ taskPath, prNumber });
    if (res?.success && res.checks) {
      return buildCheckRunsStatus(res.checks as CheckRun[]);
    }
    return null;
  } catch {
    return null;
  }
}

export async function refreshCheckRuns(query: CheckRunsQuery): Promise<CheckRunsStatus | null> {
  const key = getCheckRunsKey(query);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const promise = fetchCheckRuns(query);
  pending.set(key, promise);

  try {
    const status = await promise;
    cache.set(key, status);

    const subscription = listeners.get(key);
    if (subscription) {
      for (const listener of subscription.listeners) {
        try {
          listener(status);
        } catch {}
      }
    }

    return status;
  } finally {
    pending.delete(key);
  }
}

export async function refreshAllSubscribedCheckRuns(): Promise<void> {
  const subscriptions = Array.from(listeners.values());
  await Promise.all(subscriptions.map(({ query }) => refreshCheckRuns(query)));
}

export function subscribeToCheckRuns(query: CheckRunsQuery, listener: Listener): () => void {
  const key = getCheckRunsKey(query);
  const existing = listeners.get(key);
  const subscription = existing || { query, listeners: new Set<Listener>() };
  subscription.listeners.add(listener);
  listeners.set(key, subscription);

  const cached = cache.get(key);
  if (cached !== undefined) {
    try {
      listener(cached);
    } catch {}
  }

  if (!cache.has(key) && !pending.has(key)) {
    refreshCheckRuns(query);
  }

  return () => {
    const activeSubscription = listeners.get(key);
    if (activeSubscription) {
      activeSubscription.listeners.delete(listener);
      if (activeSubscription.listeners.size === 0) {
        listeners.delete(key);
        cache.delete(key);
      }
    }
  };
}
