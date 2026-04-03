import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitList } from '../../renderer/components/diff-viewer/CommitList';

const { toastMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
}));

vi.mock('../../renderer/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('../../renderer/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
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

describe('CommitList', () => {
  const gitGetLog = vi.fn();
  const gitSoftReset = vi.fn();
  const onGitStatusChanged = vi.fn();

  beforeEach(() => {
    toastMock.mockReset();
    gitGetLog.mockReset();
    gitSoftReset.mockReset();
    onGitStatusChanged.mockReset();

    gitGetLog.mockResolvedValue({
      success: true,
      commits: [
        {
          hash: 'top1234',
          subject: 'Latest commit',
          body: '',
          author: 'Jeff',
          authorEmail: 'jeff@example.com',
          date: '2026-04-03T00:00:00.000Z',
          isPushed: false,
          tags: [],
        },
        {
          hash: 'old1234',
          subject: 'Older commit',
          body: '',
          author: 'Jeff',
          authorEmail: 'jeff@example.com',
          date: '2026-04-02T00:00:00.000Z',
          isPushed: false,
          tags: [],
        },
      ],
      aheadCount: 2,
    });
    gitSoftReset.mockResolvedValue({ success: true, subject: 'Latest commit', body: '' });
    onGitStatusChanged.mockImplementation(() => () => {});

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        gitGetLog,
        gitSoftReset,
        onGitStatusChanged,
      },
    });
  });

  it('auto-selects the latest commit', async () => {
    const onSelectCommit = vi.fn();
    render(
      <CommitList taskPath="/tmp/repo" selectedCommit={null} onSelectCommit={onSelectCommit} />
    );

    await waitFor(() =>
      expect(onSelectCommit).toHaveBeenCalledWith({
        hash: 'top1234',
        subject: 'Latest commit',
        body: '',
        author: 'Jeff',
      })
    );
  });

  it('undoes the top unpushed commit from the context menu', async () => {
    const onSelectCommit = vi.fn();
    render(
      <CommitList taskPath="/tmp/repo" selectedCommit="top1234" onSelectCommit={onSelectCommit} />
    );

    await screen.findByText('Latest commit');
    fireEvent.click(screen.getAllByRole('button', { name: /undo commit/i })[0]);

    await waitFor(() => expect(gitSoftReset).toHaveBeenCalledWith({ taskPath: '/tmp/repo' }));
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Commit undone',
      description: 'Latest commit',
    });
  });

  it('undoes the top pushed commit after confirmation', async () => {
    gitGetLog.mockResolvedValueOnce({
      success: true,
      commits: [
        {
          hash: 'top1234',
          subject: 'Latest commit',
          body: '',
          author: 'Jeff',
          authorEmail: 'jeff@example.com',
          date: '2026-04-03T00:00:00.000Z',
          isPushed: true,
          tags: [],
        },
      ],
      aheadCount: 0,
    });

    render(<CommitList taskPath="/tmp/repo" selectedCommit="top1234" onSelectCommit={vi.fn()} />);

    await screen.findByText('Latest commit');
    fireEvent.click(screen.getByRole('button', { name: /undo commit/i }));
    fireEvent.click(screen.getByRole('button', { name: /undo locally/i }));

    await waitFor(() =>
      expect(gitSoftReset).toHaveBeenCalledWith({ taskPath: '/tmp/repo', allowPushed: true })
    );
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Commit undone locally',
      description: 'Latest commit Force push to update origin.',
    });
  });

  it('only shows undo for the most recent commit', async () => {
    render(<CommitList taskPath="/tmp/repo" selectedCommit="top1234" onSelectCommit={vi.fn()} />);

    await screen.findByText('Older commit');
    expect(screen.getAllByRole('button', { name: /undo commit/i })).toHaveLength(1);
  });
});
