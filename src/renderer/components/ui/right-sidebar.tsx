import * as React from 'react';
import { RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY } from '@/constants/layout';

interface RightSidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (next: boolean) => void;
}

const RightSidebarContext = React.createContext<RightSidebarContextValue | undefined>(undefined);

export interface RightSidebarProviderProps {
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

export function RightSidebarProvider({
  children,
  defaultCollapsed = false,
}: RightSidebarProviderProps) {
  const storageKey = RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY;
  const persistCollapsed = React.useCallback(
    (next: boolean) => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(storageKey, next ? 'true' : 'false');
      } catch {
        // ignore persistence errors
      }
    },
    [storageKey]
  );

  const [collapsed, setCollapsedState] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultCollapsed;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === null) return defaultCollapsed;
      return stored === 'true';
    } catch {
      return defaultCollapsed;
    }
  });

  const setCollapsed = React.useCallback(
    (next: boolean) => {
      persistCollapsed(next);
      setCollapsedState(next);
    },
    [persistCollapsed]
  );

  const toggle = React.useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      persistCollapsed(next);
      return next;
    });
  }, [persistCollapsed]);

  const value = React.useMemo<RightSidebarContextValue>(
    () => ({ collapsed, toggle, setCollapsed }),
    [collapsed, toggle, setCollapsed]
  );

  return <RightSidebarContext.Provider value={value}>{children}</RightSidebarContext.Provider>;
}

export function useRightSidebar() {
  const context = React.useContext(RightSidebarContext);
  if (!context) {
    throw new Error('useRightSidebar must be used within a RightSidebarProvider');
  }
  return context;
}
