import { useLocation, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';

interface WorkspaceNavigateOptions {
  replace?: boolean;
}

export function useWorkspaceLocation() {
  const location = useLocation();

  return {
    pathname: location.pathname,
    search: location.searchStr,
  };
}

export function useWorkspaceNavigate() {
  const navigate = useNavigate();

  return useCallback(
    (href: string, options: WorkspaceNavigateOptions = {}) =>
      navigate({
        href,
        replace: options.replace,
      }),
    [navigate]
  );
}
