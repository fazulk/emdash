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

describe('CommitArea', () => {
  const getBranchStatus = vi.fn();
  const gitGetLatestCommit = vi.fn();
  const gitCommit = vi.fn();
  const gitPush = vi.fn();
  const gitCommitAndPush = vi.fn();
  const gitSoftReset = vi.fn();

  beforeEach(() => {
    toastMock.mockReset();
    getBranchStatus.mockReset();
    gitGetLatestCommit.mockReset();
    gitCommit.mockReset();
    gitPush.mockReset();
    gitCommitAndPush.mockReset();
    gitSoftReset.mockReset();

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
    gitCommitAndPush.mockResolvedValue({ success: true, branch: 'main' });

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getBranchStatus,
        gitGetLatestCommit,
        gitCommit,
        gitPush,
        gitCommitAndPush,
        gitSoftReset,
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

  it('commits and pushes without creating a new branch', async () => {
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
