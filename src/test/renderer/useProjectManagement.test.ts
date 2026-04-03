import { describe, expect, it, vi } from 'vitest';
import {
  getProjectGithubUrl,
  projectHasGithubRepo,
  resolveProjectGithubInfo,
  isGithubRemoteUrl,
} from '../../renderer/lib/projectUtils';

describe('isGithubRemoteUrl', () => {
  it('returns true for HTTPS GitHub remotes', () => {
    expect(isGithubRemoteUrl('https://github.com/user/repo.git')).toBe(true);
  });

  it('returns true for SSH GitHub remotes', () => {
    expect(isGithubRemoteUrl('git@github.com:user/repo.git')).toBe(true);
  });

  it('returns false for non-GitHub remotes', () => {
    expect(isGithubRemoteUrl('https://gitlab.com/user/repo.git')).toBe(false);
  });
});

describe('getProjectGithubUrl', () => {
  it('builds a URL from the saved repository when present', () => {
    expect(
      getProjectGithubUrl({
        gitInfo: { isGitRepo: true, remote: 'https://example.com/user/repo.git' },
        githubInfo: { connected: false, repository: 'user/repo' },
      })
    ).toBe('https://github.com/user/repo');
  });

  it('builds a URL from an HTTPS GitHub remote', () => {
    expect(
      getProjectGithubUrl({
        gitInfo: { isGitRepo: true, remote: 'https://github.com/user/repo.git' },
      })
    ).toBe('https://github.com/user/repo');
  });

  it('builds a URL from an SSH GitHub remote', () => {
    expect(
      getProjectGithubUrl({
        gitInfo: { isGitRepo: true, remote: 'git@github.com:user/repo.git' },
      })
    ).toBe('https://github.com/user/repo');
  });

  it('returns null for non-GitHub remotes', () => {
    expect(
      getProjectGithubUrl({
        gitInfo: { isGitRepo: true, remote: 'https://gitlab.com/user/repo.git' },
      })
    ).toBeNull();
  });
});

describe('projectHasGithubRepo', () => {
  it('returns true when the project has a GitHub remote even if disconnected', () => {
    expect(
      projectHasGithubRepo({
        gitInfo: { isGitRepo: true, remote: 'https://github.com/user/repo.git' },
        githubInfo: { connected: false, repository: '' },
      })
    ).toBe(true);
  });

  it('returns true when the saved GitHub repository is present', () => {
    expect(
      projectHasGithubRepo({
        gitInfo: { isGitRepo: true, remote: 'https://example.com/user/repo.git' },
        githubInfo: { connected: false, repository: 'user/repo' },
      })
    ).toBe(true);
  });

  it('returns false when the project is not on GitHub', () => {
    expect(
      projectHasGithubRepo({
        gitInfo: { isGitRepo: true, remote: 'https://gitlab.com/user/repo.git' },
      })
    ).toBe(false);
  });
});

describe('resolveProjectGithubInfo', () => {
  const projectPath = '/path/to/project';
  const githubRemote = 'https://github.com/user/repo.git';
  const sshGithubRemote = 'git@github.com:user/repo.git';
  const nonGithubRemote = 'https://gitlab.com/user/repo.git';

  it('returns connected when authenticated and connectToGitHub succeeds', async () => {
    const connectToGitHub = vi.fn().mockResolvedValue({ success: true, repository: 'user/repo' });

    const result = await resolveProjectGithubInfo(projectPath, githubRemote, true, connectToGitHub);

    expect(connectToGitHub).toHaveBeenCalledWith(projectPath);
    expect(result).toEqual({ connected: true, repository: 'user/repo', source: 'github' });
  });

  it('falls through to local when connectToGitHub fails', async () => {
    const connectToGitHub = vi.fn().mockResolvedValue({ success: false, error: 'Bad credentials' });

    const result = await resolveProjectGithubInfo(projectPath, githubRemote, true, connectToGitHub);

    expect(connectToGitHub).toHaveBeenCalledWith(projectPath);
    expect(result).toEqual({ connected: false, repository: '', source: 'local' });
  });

  it('skips connectToGitHub when not authenticated', async () => {
    const connectToGitHub = vi.fn();

    const result = await resolveProjectGithubInfo(
      projectPath,
      githubRemote,
      false,
      connectToGitHub
    );

    expect(connectToGitHub).not.toHaveBeenCalled();
    expect(result).toEqual({ connected: false, repository: '', source: 'local' });
  });

  it('skips connectToGitHub when remote is not GitHub', async () => {
    const connectToGitHub = vi.fn();

    const result = await resolveProjectGithubInfo(
      projectPath,
      nonGithubRemote,
      true,
      connectToGitHub
    );

    expect(connectToGitHub).not.toHaveBeenCalled();
    expect(result).toEqual({ connected: false, repository: '', source: 'local' });
  });

  it('falls through to local when connectToGitHub throws', async () => {
    const connectToGitHub = vi.fn().mockRejectedValue(new Error('network error'));

    const result = await resolveProjectGithubInfo(projectPath, githubRemote, true, connectToGitHub);

    expect(connectToGitHub).toHaveBeenCalledWith(projectPath);
    expect(result).toEqual({ connected: false, repository: '', source: 'local' });
  });

  it('handles SSH-style GitHub remotes', async () => {
    const connectToGitHub = vi.fn().mockResolvedValue({ success: true, repository: 'user/repo' });

    const result = await resolveProjectGithubInfo(
      projectPath,
      sshGithubRemote,
      true,
      connectToGitHub
    );

    expect(connectToGitHub).toHaveBeenCalledWith(projectPath);
    expect(result).toEqual({ connected: true, repository: 'user/repo', source: 'github' });
  });
});
