import { lifecycleTerminalId } from './lifecycleTerminals';

type SelectedMode = 'task' | 'global' | 'lifecycle' | 'script';
type LifecyclePhase = 'setup' | 'run' | 'teardown';

export function scriptTerminalId(taskKey: string, scriptName: string): string {
  return `${taskKey}::script::${scriptName}`;
}

export function getExpandableTerminalInfo(params: {
  taskId: string | null;
  taskName: string | null;
  taskKey: string;
  projectPath?: string;
  parsedMode: SelectedMode | null;
  activeTerminalId: string | null;
  selectedLifecycle: LifecyclePhase | null;
  selectedScript: string | null;
}): { terminalId: string | null; title: string } {
  const {
    taskId,
    taskName,
    taskKey,
    projectPath,
    parsedMode,
    activeTerminalId,
    selectedLifecycle,
    selectedScript,
  } = params;

  if (taskId && selectedLifecycle) {
    return {
      terminalId: lifecycleTerminalId(taskId, selectedLifecycle),
      title: `${taskName || 'Task'} — ${capitalize(selectedLifecycle)}`,
    };
  }

  if (selectedScript) {
    return {
      terminalId: scriptTerminalId(taskKey, selectedScript),
      title: `${taskName || 'Task'} — ${selectedScript}`,
    };
  }

  if (activeTerminalId && parsedMode === 'task') {
    return {
      terminalId: activeTerminalId,
      title: `${taskName || 'Task'} — Terminal`,
    };
  }

  if (activeTerminalId && parsedMode === 'global') {
    return {
      terminalId: activeTerminalId,
      title: projectPath ? 'Project Terminal' : 'Global Terminal',
    };
  }

  return { terminalId: null, title: 'Terminal' };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
