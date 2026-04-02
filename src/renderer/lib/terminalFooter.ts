type TaskTerminalContext = {
  branch?: string | null;
  path?: string | null;
  useWorktree?: boolean;
};

type TerminalFooterMode = 'task' | 'global' | null;

export interface TerminalFooterSummary {
  branch: string | null;
  worktreeName: string | null;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function getPathLeaf(path?: string | null): string | null {
  if (!path) return null;
  const normalized = normalizePath(path);
  if (!normalized) return null;
  const parts = normalized.split('/');
  return parts[parts.length - 1] || null;
}

export function getTerminalFooterSummary(args: {
  mode: TerminalFooterMode;
  task?: TaskTerminalContext | null;
  projectPath?: string | null;
  projectBranch?: string | null;
}): TerminalFooterSummary {
  const { mode, task, projectPath, projectBranch } = args;

  if (mode === 'task' && task) {
    const branch = task.branch?.trim() || null;
    const taskPath = task.path?.trim() || null;
    const explicitUseWorktree = typeof task.useWorktree === 'boolean' ? task.useWorktree : null;
    const inferredUseWorktree =
      explicitUseWorktree ??
      Boolean(taskPath && projectPath && normalizePath(taskPath) !== normalizePath(projectPath));

    return {
      branch,
      worktreeName: inferredUseWorktree ? getPathLeaf(taskPath) : null,
    };
  }

  if (mode === 'global') {
    return {
      branch: projectBranch?.trim() || null,
      worktreeName: null,
    };
  }

  return {
    branch: null,
    worktreeName: null,
  };
}
