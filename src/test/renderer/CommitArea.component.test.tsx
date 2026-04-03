import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitArea } from '../../renderer/components/diff-viewer/CommitArea';

const { toastMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
}));

vi.mock('../../renderer/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('../../renderer/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../renderer/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock('../../renderer/contexts/TaskManagementContext', () => ({
  useTaskManagementContext: () => ({
    activeTask: null,
    handleOpenCreateTaskFromCurrentBranchModal: vi.fn(),
  }),
}));

vi.mock('../../renderer/contexts/ProjectManagementProvider', () => ({
  useProjectManagementContext: () => ({
    selectedProject: null,
  }),
}));

describe('CommitArea', () => {
  const getBranchStatus = vi.fn();
  const gitGetLatestCommit = vi.fn();
  const gitCommit = vi.fn();
  const gitPush = vi.fn();
  const gitCommitAndPush = vi.fn();
  const gitSoftReset = vi.fn();
  const gitPull = vi.fn();

  beforeEach(() => {
    toastMock.mockReset();
    getBranchStatus.mockReset();
    gitGetLatestCommit.mockReset();
    gitCommit.mockReset();
    gitPush.mockReset();
    gitCommitAndPush.mockReset();
    gitSoftReset.mockReset();
    gitPull.mockReset();

    getBranchStatus.mockResolvedValue({
      success: true,
      branch: 'main',
      ahead: 1,
      behind: 0,
    });
    gitGetLatestCommit.mockResolvedValue({
      success: true,
      commit: {
        hash: 'abc123',
        subject: 'test commit',
        body: '',
        isPushed: false,
      },
    });
    gitCommit.mockResolvedValue({ success: true, hash: 'abc123' });
    gitPush.mockResolvedValue({ success: true });
    gitCommitAndPush.mockResolvedValue({ success: true, branch: 'main', message: 'ship it' });
    gitPull.mockResolvedValue({ success: true });
    gitSoftReset.mockResolvedValue({ success: true, subject: 'test commit', body: '' });

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getBranchStatus,
        gitGetLatestCommit,
        gitCommit,
        gitPush,
        gitCommitAndPush,
        gitSoftReset,
        gitPull,
      },
    });
  });

  it('pushes the current branch without using commit-and-push branch creation flow', async () => {
    render(<CommitArea taskPath="/tmp/repo" fileChanges={[]} />);

    const pushButton = await screen.findByRole('button', { name: /^push\b/i });
    await waitFor(() => expect(pushButton).toBeEnabled());

    fireEvent.click(pushButton);

    await waitFor(() => expect(gitPush).toHaveBeenCalledWith({ taskPath: '/tmp/repo' }));
    expect(gitCommitAndPush).not.toHaveBeenCalled();
  });

  it('commits and pushes without creating a new branch and shows a toast', async () => {
    render(
      <CommitArea
        taskPath="/tmp/repo"
        fileChanges={[{ path: 'file.ts', status: 'modified', isStaged: true } as any]}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Enter commit message'), {
      target: { value: 'ship it' },
    });
    fireEvent.change(screen.getByPlaceholderText('Description'), {
      target: { value: 'more context' },
    });

    fireEvent.click(screen.getByRole('button', { name: /commit & push/i }));

    await waitFor(() =>
      expect(gitCommitAndPush).toHaveBeenCalledWith({
        taskPath: '/tmp/repo',
        commitMessage: 'ship it',
        body: 'more context',
        createBranchIfOnDefault: false,
      })
    );
    expect(gitPush).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Committed and Pushed',
        descriptionClassName: 'line-clamp-none opacity-100',
      })
    );
  });

  it('allows commit and push with a blank subject so the backend can generate one', async () => {
    render(
      <CommitArea
        taskPath="/tmp/repo"
        fileChanges={[{ path: 'file.ts', status: 'modified', isStaged: true } as any]}
      />
    );

    const commitAndPushButton = screen.getByRole('button', { name: /commit & push/i });
    expect(commitAndPushButton).toBeEnabled();

    fireEvent.change(screen.getByPlaceholderText('Description'), {
      target: { value: 'more context' },
    });
    fireEvent.click(commitAndPushButton);

    await waitFor(() =>
      expect(gitCommitAndPush).toHaveBeenCalledWith({
        taskPath: '/tmp/repo',
        commitMessage: undefined,
        body: 'more context',
        createBranchIfOnDefault: false,
      })
    );
  });

  it('shows a success toast after pull', async () => {
    getBranchStatus.mockResolvedValue({
      success: true,
      branch: 'main',
      ahead: 0,
      behind: 2,
    });
    gitGetLatestCommit.mockResolvedValue({
      success: true,
      commit: {
        hash: 'abc123',
        subject: 'test commit',
        body: '',
        isPushed: true,
      },
    });

    render(<CommitArea taskPath="/tmp/repo" fileChanges={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: /pull \(2\)/i }));

    await waitFor(() => expect(gitPull).toHaveBeenCalledWith({ taskPath: '/tmp/repo' }));
    expect(toastMock).toHaveBeenCalledWith({ title: 'Pulled successfully' });
  });

  it('shows a success toast after undo', async () => {
    render(<CommitArea taskPath="/tmp/repo" fileChanges={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: /^undo$/i }));

    await waitFor(() => expect(gitSoftReset).toHaveBeenCalledWith({ taskPath: '/tmp/repo' }));
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Commit undone',
      description: 'test commit',
    });
  });

  it('confirms before undoing a pushed commit', async () => {
    gitGetLatestCommit.mockResolvedValue({
      success: true,
      commit: {
        hash: 'abc123',
        subject: 'test commit',
        body: '',
        isPushed: true,
      },
    });

    render(<CommitArea taskPath="/tmp/repo" fileChanges={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: /^undo$/i }));
    fireEvent.click(screen.getByRole('button', { name: /undo locally/i }));

    await waitFor(() =>
      expect(gitSoftReset).toHaveBeenCalledWith({ taskPath: '/tmp/repo', allowPushed: true })
    );
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Commit undone locally',
      description: 'test commit Force push to update origin.',
    });
  });

  it('can force push from the push actions menu', async () => {
    render(<CommitArea taskPath="/tmp/repo" fileChanges={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: /force push to origin/i }));
    fireEvent.click(screen.getByRole('button', { name: /^force push$/i }));

    await waitFor(() =>
      expect(gitPush).toHaveBeenCalledWith({ taskPath: '/tmp/repo', force: true })
    );
    expect(toastMock).toHaveBeenCalledWith({ title: 'Force pushed successfully' });
  });

  it('shows the push button disabled when there is nothing to push', async () => {
    getBranchStatus.mockResolvedValue({
      success: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
    });
    gitGetLatestCommit.mockResolvedValue({
      success: true,
      commit: {
        hash: 'abc123',
        subject: 'test commit',
        body: '',
        isPushed: true,
      },
    });

    render(<CommitArea taskPath="/tmp/repo" fileChanges={[]} />);

    await screen.findByText('test commit');
    expect(screen.getByRole('button', { name: /^push\b/i })).toBeDisabled();
  });
});
