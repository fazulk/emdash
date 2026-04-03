import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileChangesPanel } from '../../renderer/components/FileChangesPanel';

const getBranchStatusMock = vi.fn();
const gitCommitAndPushMock = vi.fn();
const toastMock = vi.fn();
const refreshChangesMock = vi.fn();
const refreshPrMock = vi.fn();
const useFileChangesMock = vi.fn();

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
  },
}));

vi.mock('../../renderer/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('../../renderer/hooks/useCreatePR', () => ({
  useCreatePR: () => ({
    isCreatingForTaskPath: () => false,
    createPR: vi.fn(),
  }),
}));

vi.mock('../../renderer/hooks/useFileChanges', () => ({
  useFileChanges: (...args: unknown[]) => useFileChangesMock(...args),
}));

vi.mock('../../renderer/hooks/usePrStatus', () => ({
  usePrStatus: () => ({
    pr: null,
    isLoading: false,
    refresh: refreshPrMock,
  }),
}));

vi.mock('../../renderer/hooks/useCheckRuns', () => ({
  useCheckRuns: () => ({
    status: null,
    isLoading: false,
  }),
}));

vi.mock('../../renderer/hooks/useAutoCheckRunsRefresh', () => ({
  useAutoCheckRunsRefresh: () => undefined,
}));

vi.mock('../../renderer/hooks/usePrComments', () => ({
  usePrComments: () => ({
    status: null,
    isLoading: false,
  }),
}));

vi.mock('../../renderer/components/CheckRunsList', () => ({
  ChecksPanel: () => <div data-testid="checks-panel" />,
}));

vi.mock('../../renderer/components/PrCommentsList', () => ({
  PrCommentsList: () => <div data-testid="pr-comments-list" />,
}));

vi.mock('../../renderer/components/MergePrSection', () => ({
  default: () => <div data-testid="merge-pr-section" />,
}));

vi.mock('../../renderer/components/FileExplorer/FileIcons', () => ({
  FileIcon: () => <div data-testid="file-icon" />,
}));

vi.mock('../../renderer/components/TaskScopeContext', () => ({
  useTaskScope: () => ({
    taskId: undefined,
    taskPath: undefined,
    prNumber: undefined,
  }),
}));

describe('FileChangesPanel', () => {
  beforeEach(() => {
    toastMock.mockReset();
    refreshChangesMock.mockReset();
    refreshPrMock.mockReset();
    getBranchStatusMock.mockReset();
    gitCommitAndPushMock.mockReset();
    useFileChangesMock.mockReset();
    getBranchStatusMock.mockResolvedValue({
      success: true,
      branch: 'main',
      ahead: 2,
      behind: 0,
    });
    gitCommitAndPushMock.mockResolvedValue({
      success: true,
      branch: 'main',
      message: 'Update src/file.ts',
    });
    useFileChangesMock.mockReturnValue({
      fileChanges: [
        {
          path: 'src/file.ts',
          status: 'modified',
          isStaged: false,
          additions: 5,
          deletions: 2,
        },
      ],
      isLoading: false,
      refreshChanges: refreshChangesMock,
    });

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getBranchStatus: getBranchStatusMock,
        gitCommitAndPush: gitCommitAndPushMock,
      },
    });
  });

  it('always shows commit actions and push count in the top action row', async () => {
    render(<FileChangesPanel taskId="task-1" taskPath="/tmp/repo" />);

    await waitFor(() => expect(getBranchStatusMock).toHaveBeenCalled());

    expect(screen.getByPlaceholderText('Enter commit message...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Commit & Push' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Push (2)' })).toBeEnabled();
  });

  it('allows commit and push with a blank subject so the backend can generate one', async () => {
    useFileChangesMock.mockReturnValue({
      fileChanges: [
        {
          path: 'src/file.ts',
          status: 'modified',
          isStaged: true,
          additions: 5,
          deletions: 2,
        },
      ],
      isLoading: false,
      refreshChanges: refreshChangesMock,
    });

    render(<FileChangesPanel taskId="task-1" taskPath="/tmp/repo" />);

    await waitFor(() => expect(getBranchStatusMock).toHaveBeenCalled());

    const commitAndPushButton = screen.getByRole('button', { name: 'Commit & Push' });
    expect(commitAndPushButton).toBeEnabled();

    fireEvent.click(commitAndPushButton);

    await waitFor(() =>
      expect(gitCommitAndPushMock).toHaveBeenCalledWith({
        taskPath: '/tmp/repo',
        taskId: 'task-1',
        commitMessage: undefined,
        createBranchIfOnDefault: false,
      })
    );
  });
});
