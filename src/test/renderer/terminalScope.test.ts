import { describe, expect, it } from 'vitest';
import { getGlobalTerminalKey } from '../../renderer/lib/terminalScope';

describe('getGlobalTerminalKey', () => {
  it('prefers the project path when both project and task paths exist', () => {
    expect(
      getGlobalTerminalKey({
        projectPath: '/repo',
        taskPath: '/repo/.worktrees/task-1',
      })
    ).toBe('global::/repo');
  });

  it('falls back to the task path when no project path exists', () => {
    expect(
      getGlobalTerminalKey({
        projectPath: null,
        taskPath: '/repo/.worktrees/task-1',
      })
    ).toBe('global::/repo/.worktrees/task-1');
  });

  it('uses the home scope when no path context exists', () => {
    expect(
      getGlobalTerminalKey({
        projectPath: null,
        taskPath: null,
      })
    ).toBe('global::home');
  });
});
