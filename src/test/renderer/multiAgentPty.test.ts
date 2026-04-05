import { describe, expect, it } from 'vitest';
import { makePtyId } from '../../shared/ptyId';
import { getMultiAgentMainPtyId, getMultiAgentVariantKey } from '../../renderer/lib/multiAgentPty';

describe('multiAgentPty', () => {
  it('builds canonical main PTY ids for known providers', () => {
    const variant = { agent: 'codex', worktreeId: 'worktree-123', path: '/tmp/worktree-123' };

    expect(getMultiAgentMainPtyId(variant)).toBe(makePtyId('codex', 'main', 'worktree-123'));
  });

  it('uses worktree id as the variant key', () => {
    const variant = { agent: 'claude', worktreeId: 'worktree-abc', path: '/tmp/worktree-abc' };

    expect(getMultiAgentVariantKey(variant)).toBe('worktree-abc');
  });

  it('falls back to legacy id format for unknown providers', () => {
    const variant = { agent: 'unknown-agent', worktreeId: 'worktree-x', path: '/tmp/worktree-x' };

    expect(getMultiAgentMainPtyId(variant)).toBe('worktree-x-main');
  });
});
