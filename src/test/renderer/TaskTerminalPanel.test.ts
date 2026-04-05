import { describe, expect, it } from 'vitest';
import { shouldDisablePlay } from '../../renderer/lib/lifecycleUi';
import { getExpandableTerminalInfo, scriptTerminalId } from '../../renderer/lib/taskTerminalUi';
import { lifecycleTerminalId } from '../../renderer/lib/lifecycleTerminals';

describe('TaskTerminalPanel', () => {
  it('uses the lifecycle terminal when a lifecycle log is selected', () => {
    const info = getExpandableTerminalInfo({
      taskId: 'task-1',
      taskName: 'Feature A',
      taskKey: 'task-1::/tmp/feature-a',
      projectPath: '/tmp/project',
      parsedMode: 'lifecycle',
      activeTerminalId: null,
      selectedLifecycle: 'run',
      selectedScript: null,
    });

    expect(info).toEqual({
      terminalId: lifecycleTerminalId('task-1', 'run'),
      title: 'Feature A — Run',
    });
  });

  it('uses the script terminal when a custom script is selected', () => {
    const info = getExpandableTerminalInfo({
      taskId: 'task-1',
      taskName: 'Feature A',
      taskKey: 'task-1::/tmp/feature-a',
      projectPath: '/tmp/project',
      parsedMode: 'script',
      activeTerminalId: null,
      selectedLifecycle: null,
      selectedScript: 'lint',
    });

    expect(info).toEqual({
      terminalId: scriptTerminalId('task-1::/tmp/feature-a', 'lint'),
      title: 'Feature A — lint',
    });
  });

  it('uses the active terminal for task and global terminal selections', () => {
    expect(
      getExpandableTerminalInfo({
        taskId: 'task-1',
        taskName: 'Feature A',
        taskKey: 'task-1::/tmp/feature-a',
        projectPath: '/tmp/project',
        parsedMode: 'task',
        activeTerminalId: 'task-term-1',
        selectedLifecycle: null,
        selectedScript: null,
      })
    ).toEqual({
      terminalId: 'task-term-1',
      title: 'Feature A — Terminal',
    });

    expect(
      getExpandableTerminalInfo({
        taskId: null,
        taskName: null,
        taskKey: 'task-placeholder',
        projectPath: '/tmp/project',
        parsedMode: 'global',
        activeTerminalId: 'global-term-1',
        selectedLifecycle: null,
        selectedScript: null,
      })
    ).toEqual({
      terminalId: 'global-term-1',
      title: 'Project Terminal',
    });
  });

  it('disables play for run selection when run cannot start', () => {
    const disabled = shouldDisablePlay({
      runActionBusy: false,
      hasProjectPath: true,
      isRunSelection: true,
      canStartRun: false,
    });
    expect(disabled).toBe(true);
  });

  it('does not disable play for non-run lifecycle phases when run cannot start', () => {
    const disabled = shouldDisablePlay({
      runActionBusy: false,
      hasProjectPath: true,
      isRunSelection: false,
      canStartRun: false,
    });
    expect(disabled).toBe(false);
  });
});
