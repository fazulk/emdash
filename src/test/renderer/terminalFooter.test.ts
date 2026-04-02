import { describe, expect, it } from 'vitest';
import { getPathLeaf, getTerminalFooterSummary } from '../../renderer/lib/terminalFooter';

describe('terminalFooter', () => {
  it('returns the basename for posix and windows-like paths', () => {
    expect(getPathLeaf('/tmp/worktrees/task-alpha-123')).toBe('task-alpha-123');
    expect(getPathLeaf('C:\\repo\\worktrees\\task-alpha-123\\')).toBe('task-alpha-123');
  });

  it('shows branch and worktree for task-scoped worktree terminals', () => {
    expect(
      getTerminalFooterSummary({
        mode: 'task',
        task: {
          branch: 'emdash/fix-footer',
          path: '/repo/worktrees/fix-footer-abc',
          useWorktree: true,
        },
        projectPath: '/repo',
        projectBranch: 'main',
      })
    ).toEqual({
      branch: 'emdash/fix-footer',
      worktreeName: 'fix-footer-abc',
    });
  });

  it('omits worktree name for direct tasks on the main checkout', () => {
    expect(
      getTerminalFooterSummary({
        mode: 'task',
        task: {
          branch: 'main',
          path: '/repo',
          useWorktree: false,
        },
        projectPath: '/repo',
        projectBranch: 'main',
      })
    ).toEqual({
      branch: 'main',
      worktreeName: null,
    });
  });

  it('shows the project branch for project terminals', () => {
    expect(
      getTerminalFooterSummary({
        mode: 'global',
        projectPath: '/repo',
        projectBranch: 'main',
      })
    ).toEqual({
      branch: 'main',
      worktreeName: null,
    });
  });
});
