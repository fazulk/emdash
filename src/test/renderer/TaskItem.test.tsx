import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskItem } from '../../renderer/components/TaskItem';

vi.mock('../../renderer/hooks/useTaskChanges', () => ({
  useTaskChanges: vi.fn(() => ({
    totalAdditions: 0,
    totalDeletions: 0,
    isLoading: false,
  })),
}));

vi.mock('../../renderer/hooks/usePrStatus', () => ({
  usePrStatus: vi.fn(() => ({
    pr: null,
  })),
}));

vi.mock('../../renderer/hooks/useTaskBusy', () => ({
  useTaskBusy: vi.fn(() => false),
}));

vi.mock('../../renderer/hooks/useTaskStatus', () => ({
  useTaskStatus: vi.fn(() => 'idle'),
}));

vi.mock('../../renderer/hooks/useTaskUnread', () => ({
  useTaskUnread: vi.fn(() => false),
}));

vi.mock('../../renderer/components/TaskChanges', () => ({
  ChangesBadge: ({ additions, deletions }: { additions: number; deletions: number }) => (
    <div>{`${additions}/${deletions}`}</div>
  ),
}));

vi.mock('../../renderer/components/PrPreviewTooltip', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../renderer/components/TaskStatusIndicator', () => ({
  TaskStatusIndicator: () => <div data-testid="task-status-indicator" />,
}));

vi.mock('../../renderer/components/TaskDeleteButton', () => ({
  default: () => <button type="button">Delete</button>,
}));

const baseTask = {
  id: 'task-1',
  name: 'task alpha',
  branch: 'feature/task-alpha',
  path: '/tmp/task-alpha',
  status: 'idle' as const,
};

describe('TaskItem', () => {
  it('renders the worktree icon when useWorktree is true', () => {
    render(<TaskItem task={{ ...baseTask, useWorktree: true }} />);

    expect(screen.getByLabelText('Worktree task')).toBeInTheDocument();
  });

  it('does not render the worktree icon when useWorktree is false', () => {
    render(<TaskItem task={{ ...baseTask, useWorktree: false }} />);

    expect(screen.queryByLabelText('Worktree task')).not.toBeInTheDocument();
  });

  it('does not render the worktree icon when useWorktree is undefined', () => {
    render(<TaskItem task={baseTask} />);

    expect(screen.queryByLabelText('Worktree task')).not.toBeInTheDocument();
  });
});
