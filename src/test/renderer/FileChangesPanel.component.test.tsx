import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileChangesPanel } from '../../renderer/components/FileChangesPanel';
import { GitWorkspaceBusyProvider } from '../../renderer/contexts/GitWorkspaceBusyContext';

const getBranchStatusMock = vi.fn();
const gitCommitMock = vi.fn();
const gitCommitAndPushMock = vi.fn();
const toastMock = vi.fn();
const refreshChangesMock = vi.fn();
const refreshPrMock = vi.fn();
const useFileChangesMock = vi.fn();
const usePrStatusMock = vi.fn();
const useCheckRunsMock = vi.fn();
const useAutoCheckRunsRefreshMock = vi.fn();
const onGitStatusChangedMock = vi.fn();

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
  usePrStatus: (...args: unknown[]) => usePrStatusMock(...args),
}));

vi.mock('../../renderer/hooks/useCheckRuns', () => ({
  useCheckRuns: (...args: unknown[]) => useCheckRunsMock(...args),
}));

vi.mock('../../renderer/hooks/useAutoCheckRunsRefresh', () => ({
  useAutoCheckRunsRefresh: (...args: unknown[]) => useAutoCheckRunsRefreshMock(...args),
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
    localStorage.clear();
    toastMock.mockReset();
    refreshChangesMock.mockReset();
    refreshPrMock.mockReset();
    getBranchStatusMock.mockReset();
    gitCommitMock.mockReset();
    gitCommitAndPushMock.mockReset();
    useFileChangesMock.mockReset();
    usePrStatusMock.mockReset();
    useCheckRunsMock.mockReset();
    useAutoCheckRunsRefreshMock.mockReset();
    onGitStatusChangedMock.mockReset();
    onGitStatusChangedMock.mockImplementation(() => () => {});
    getBranchStatusMock.mockResolvedValue({
      success: true,
      branch: 'main',
      ahead: 2,
      behind: 0,
    });
    gitCommitMock.mockResolvedValue({
      success: true,
      hash: 'abc123',
      message: 'Update src/file.ts',
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
    usePrStatusMock.mockReturnValue({
      pr: null,
      isLoading: false,
      refresh: refreshPrMock,
    });
    useCheckRunsMock.mockReturnValue({
      status: null,
      isLoading: false,
    });
    useAutoCheckRunsRefreshMock.mockReturnValue(undefined);

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getBranchStatus: getBranchStatusMock,
        gitCommit: gitCommitMock,
        gitCommitAndPush: gitCommitAndPushMock,
        onGitStatusChanged: onGitStatusChangedMock,
      },
    });

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('always shows commit actions and push count in the top action row', async () => {
    render(<FileChangesPanel taskId="task-1" taskPath="/tmp/repo" />);

    await waitFor(() => expect(getBranchStatusMock).toHaveBeenCalled());

    expect(screen.getByPlaceholderText('Leave blank to auto generate...')).toBeInTheDocument();
    // Unstaged-only changes: commit actions stage everything first, so they stay enabled.
    expect(screen.getByRole('button', { name: 'Commit' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Commit & Push' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Push (2)' })).toBeEnabled();
  });

  it('still shows commit and push actions when there are no file changes', async () => {
    useFileChangesMock.mockReturnValue({
      fileChanges: [],
      isLoading: false,
      refreshChanges: refreshChangesMock,
    });

    render(<FileChangesPanel taskId="task-1" taskPath="/tmp/repo" />);

    await waitFor(() => expect(getBranchStatusMock).toHaveBeenCalled());

    expect(screen.getByPlaceholderText('Leave blank to auto generate...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Commit & Push' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Push (2)' })).toBeEnabled();
  });

  it('refreshes the push count when git status changes elsewhere', async () => {
    let statusListener: ((data: { taskPath: string; error?: string }) => void) | undefined;
    onGitStatusChangedMock.mockImplementation(
      (listener: (data: { taskPath: string; error?: string }) => void) => {
      statusListener = listener;
        return () => {
          if (statusListener === listener) statusListener = undefined;
        };
      }
    );

    render(<FileChangesPanel taskId="task-1" taskPath="/tmp/repo" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Push (2)' })).toBeEnabled());

    getBranchStatusMock.mockResolvedValue({
      success: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
    });

    statusListener?.({ taskPath: '/tmp/repo' });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Push (0)' })).toBeDisabled());
  });

  it('clears the optimistic push count when a synced status update reports nothing to push', async () => {
    let statusListener: ((data: { taskPath: string; error?: string }) => void) | undefined;
    onGitStatusChangedMock.mockImplementation(
      (listener: (data: { taskPath: string; error?: string }) => void) => {
        statusListener = listener;
        return () => {
          if (statusListener === listener) statusListener = undefined;
        };
      }
    );

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

    getBranchStatusMock
      .mockResolvedValueOnce({
        success: true,
        branch: 'main',
        ahead: 0,
        behind: 0,
      })
      .mockResolvedValueOnce({
        success: true,
        branch: 'main',
        ahead: 1,
        behind: 0,
      });

    render(<FileChangesPanel taskId="task-1" taskPath="/tmp/repo" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Push (0)' })).toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));

    await waitFor(() => expect(gitCommitMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Push (1)' })).toBeEnabled());

    getBranchStatusMock.mockResolvedValue({
      success: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
    });

    statusListener?.({ taskPath: '/tmp/repo' });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Push (0)' })).toBeDisabled());
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

  it('keeps the Create PR action idle while commit is in progress', async () => {
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

    gitCommitMock.mockImplementation(
      () => new Promise(() => {}) as ReturnType<typeof gitCommitMock>
    );

    render(
      <GitWorkspaceBusyProvider>
        <FileChangesPanel taskId="task-1" taskPath="/tmp/repo" />
      </GitWorkspaceBusyProvider>
    );

    await waitFor(() => expect(getBranchStatusMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create PR' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));

    await waitFor(() => expect(gitCommitMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create PR' })).toBeEnabled());
  });

  it('keeps the Draft PR action idle while commit is in progress', async () => {
    localStorage.setItem('emdash:prMode', 'draft');

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

    gitCommitMock.mockImplementation(
      () => new Promise(() => {}) as ReturnType<typeof gitCommitMock>
    );

    render(
      <GitWorkspaceBusyProvider>
        <FileChangesPanel taskId="task-1" taskPath="/tmp/repo" />
      </GitWorkspaceBusyProvider>
    );

    await waitFor(() => expect(getBranchStatusMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Draft PR' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));

    await waitFor(() => expect(gitCommitMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Draft PR' })).toBeEnabled());
  });

  it('shows a readable, copyable commit message toast after commit and push', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Commit & Push' }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Committed and Pushed',
          descriptionClassName: 'line-clamp-none opacity-100',
        })
      )
    );

    const toastArg = toastMock.mock.calls.at(-1)?.[0];
    expect(React.isValidElement(toastArg.description)).toBe(true);
    // Copy button is now provided globally by the Toaster, so no per-toast action needed
    expect(toastArg.action).toBeUndefined();

    const toastUi = render(
      <>
        {toastArg.description}
      </>
    );

    expect(toastUi.getByText('Changes committed with message:')).toBeInTheDocument();
    expect(toastUi.getByText('Update src/file.ts')).toBeInTheDocument();
  });

  it('still shows PR actions when no PR exists and the branch is already synced', async () => {
    getBranchStatusMock.mockResolvedValue({
      success: true,
      branch: 'feature/task-1',
      ahead: 0,
      behind: 0,
    });

    render(<FileChangesPanel taskId="task-1" taskPath="/tmp/repo" />);

    await waitFor(() => expect(getBranchStatusMock).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: 'Create PR' })).toBeInTheDocument();
    expect(screen.queryByText('No PR for this task')).not.toBeInTheDocument();
  });

  it('shows View PR in the top action row when a PR already exists', async () => {
    usePrStatusMock.mockReturnValue({
      pr: {
        number: 42,
        title: 'Existing draft PR',
        url: 'https://github.com/example/repo/pull/42',
        isDraft: true,
        state: 'OPEN',
      },
      isLoading: false,
      refresh: refreshPrMock,
    });

    render(<FileChangesPanel taskId="task-1" taskPath="/tmp/repo" />);

    await waitFor(() => expect(getBranchStatusMock).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: 'View PR' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Draft PR' })).not.toBeInTheDocument();
  });

  it('queries check runs with the resolved PR number', async () => {
    usePrStatusMock.mockReturnValue({
      pr: {
        number: 173,
      },
      isLoading: false,
      refresh: refreshPrMock,
    });

    render(<FileChangesPanel taskId="task-1" taskPath="/tmp/repo" />);

    await waitFor(() => expect(getBranchStatusMock).toHaveBeenCalled());

    expect(useCheckRunsMock).toHaveBeenCalledWith('/tmp/repo', 173);
    expect(useAutoCheckRunsRefreshMock).toHaveBeenCalledWith(undefined, 173, null);
  });
});
