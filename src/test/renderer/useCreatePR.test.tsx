import React, { useEffect } from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { useCreatePR } from '../../renderer/hooks/useCreatePR';

const { toastMock, captureTelemetryMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  captureTelemetryMock: vi.fn(),
}));

vi.mock('../../renderer/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('../../renderer/lib/telemetryClient', () => ({
  captureTelemetry: captureTelemetryMock,
}));

function TestHarness({
  onDone,
  options,
}: {
  onDone?: (result: unknown) => void;
  options?: Parameters<ReturnType<typeof useCreatePR>['createPR']>[0];
}) {
  const { createPR } = useCreatePR();

  useEffect(() => {
    void createPR(options || { taskPath: '/tmp/repo' }).then((result) => onDone?.(result));
    // Intentionally run once for this test harness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

describe('useCreatePR', () => {
  const createPullRequestMock = vi.fn();
  const gitCommitAndPushMock = vi.fn();
  const getBranchStatusMock = vi.fn();
  const generatePrContentMock = vi.fn();

  beforeEach(() => {
    toastMock.mockReset();
    captureTelemetryMock.mockReset();
    createPullRequestMock.mockReset();
    gitCommitAndPushMock.mockReset();
    getBranchStatusMock.mockReset();
    generatePrContentMock.mockReset();

    createPullRequestMock.mockResolvedValue({
      success: true,
      url: 'https://github.com/example/repo/pull/123',
    });

    (window as any).electronAPI = {
      createPullRequest: createPullRequestMock,
      gitCommitAndPush: gitCommitAndPushMock,
      getBranchStatus: getBranchStatusMock,
      generatePrContent: generatePrContentMock,
      openExternal: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a PR without committing first', async () => {
    getBranchStatusMock.mockResolvedValue({
      success: true,
      branch: 'feature/task-1',
      defaultBranch: 'main',
      ahead: 0,
      aheadOfDefault: 1,
    });

    render(<TestHarness options={{ taskPath: '/tmp/repo', prOptions: { draft: true } }} />);

    await waitFor(() => expect(createPullRequestMock).toHaveBeenCalledTimes(1));

    expect(gitCommitAndPushMock).not.toHaveBeenCalled();
    expect(createPullRequestMock).toHaveBeenCalledWith({
      taskPath: '/tmp/repo',
      title: 'repo',
      fill: true,
      draft: true,
      createBranchIfOnDefault: true,
      branchPrefix: 'orch',
    });
  });

  it('uses generated AI title and description when available', async () => {
    getBranchStatusMock.mockResolvedValue({
      success: true,
      branch: 'feature/task-1',
      defaultBranch: 'main',
      ahead: 0,
      aheadOfDefault: 1,
    });
    generatePrContentMock.mockResolvedValue({
      success: true,
      title: 'feat: improve PR generation',
      description: '## Summary\n\n- Generate a better title\n- Add an initial PR description',
    });

    render(<TestHarness options={{ taskPath: '/tmp/repo' }} />);

    await waitFor(() => expect(createPullRequestMock).toHaveBeenCalledTimes(1));

    expect(createPullRequestMock).toHaveBeenCalledWith({
      taskPath: '/tmp/repo',
      title: 'feat: improve PR generation',
      body: '## Summary\n\n- Generate a better title\n- Add an initial PR description',
      fill: true,
      createBranchIfOnDefault: true,
      branchPrefix: 'orch',
    });
  });

  it(
    'waits long enough for slower AI PR generation before falling back',
    async () => {
      vi.useFakeTimers();
      getBranchStatusMock.mockResolvedValue({
        success: true,
        branch: 'feature/task-1',
        defaultBranch: 'main',
        ahead: 0,
        aheadOfDefault: 1,
      });
      generatePrContentMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                success: true,
                title: 'fix: generate PR metadata from branch changes',
                description: '## Summary\n\n- Infer the PR title\n- Infer the initial description',
              });
            }, 10000);
          })
      );

      render(<TestHarness options={{ taskPath: '/tmp/repo' }} />);

      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10000);
      await Promise.resolve();
      await Promise.resolve();

      expect(createPullRequestMock).toHaveBeenCalledTimes(1);
      expect(createPullRequestMock).toHaveBeenCalledWith({
        taskPath: '/tmp/repo',
        title: 'fix: generate PR metadata from branch changes',
        body: '## Summary\n\n- Infer the PR title\n- Infer the initial description',
        fill: true,
        createBranchIfOnDefault: true,
        branchPrefix: 'orch',
      });
    },
    10000
  );

  it('fails fast when there are no committed changes for a PR', async () => {
    getBranchStatusMock.mockResolvedValue({
      success: true,
      branch: 'feature/task-1',
      defaultBranch: 'main',
      ahead: 0,
      aheadOfDefault: 0,
    });

    render(<TestHarness options={{ taskPath: '/tmp/repo' }} />);

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'No committed changes for PR' })
      )
    );

    expect(createPullRequestMock).not.toHaveBeenCalled();
    expect(gitCommitAndPushMock).not.toHaveBeenCalled();
  });

  it('shows an error instead of spinning forever when PR creation hangs', async () => {
    vi.useFakeTimers();
    getBranchStatusMock.mockResolvedValue({
      success: true,
      branch: 'feature/task-1',
      defaultBranch: 'main',
      ahead: 0,
      aheadOfDefault: 1,
    });
    createPullRequestMock.mockImplementation(() => new Promise(() => {}));

    render(<TestHarness options={{ taskPath: '/tmp/repo' }} />);

    await vi.advanceTimersByTimeAsync(45000);
    await Promise.resolve();
    await Promise.resolve();

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('Pull request creation timed out after 45s'),
      })
    );
  });
});
