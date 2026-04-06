import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { TerminalPane } from './TerminalPane';
import { Plus, Play, RotateCw, Square, X, Maximize2 } from '@/components/icons/lucide';
import { useTheme } from '../hooks/useTheme';
import { useTaskTerminals } from '@/lib/taskTerminalsStore';
import { useTerminalSelection } from '../hooks/useTerminalSelection';
import { cn } from '@/lib/utils';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { ToastAction } from './ui/toast';
import { useTerminalSearch } from '../hooks/useTerminalSearch';
import { TerminalSearchOverlay } from './TerminalSearchOverlay';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import type { Agent } from '../types';
import { getTaskEnvVars } from '@shared/task/envVars';

import ExpandedTerminalModal from './ExpandedTerminalModal';
import { lifecycleTerminalId } from '../lib/lifecycleTerminals';
import { getExpandableTerminalInfo, scriptTerminalId } from '../lib/taskTerminalUi';

/**
 * Hook that fetches custom scripts from .emdash.json for a project.
 */
function useCustomScripts(projectPath: string | undefined): Record<string, string> {
  const [scripts, setScripts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!projectPath) {
      setScripts({});
      return;
    }
    let cancelled = false;
    const api = window.electronAPI as any;
    if (typeof api?.lifecycleGetCustomScripts !== 'function') return;
    void api.lifecycleGetCustomScripts({ projectPath }).then((res: any) => {
      if (!cancelled && res?.success && res.scripts) {
        setScripts(res.scripts);
      }
    });
    return () => { cancelled = true; };
  }, [projectPath]);
  return scripts;
}

function useLifecycleScripts(projectPath: string | undefined): Record<'setup' | 'run' | 'stop' | 'teardown', string> {
  const [scripts, setScripts] = useState<Record<'setup' | 'run' | 'stop' | 'teardown', string>>({
    setup: '',
    run: '',
    stop: '',
    teardown: '',
  });

  useEffect(() => {
    if (!projectPath) {
      setScripts({ setup: '', run: '', stop: '', teardown: '' });
      return;
    }
    let cancelled = false;
    const api = window.electronAPI as any;
    if (typeof api?.lifecycleGetScript !== 'function') return;

    void Promise.all([
      api.lifecycleGetScript({ projectPath, phase: 'setup' }),
      api.lifecycleGetScript({ projectPath, phase: 'run' }),
      api.lifecycleGetScript({ projectPath, phase: 'stop' }),
      api.lifecycleGetScript({ projectPath, phase: 'teardown' }),
    ]).then(([setup, run, stop, teardown]: any[]) => {
      if (cancelled) return;
      setScripts({
        setup: setup?.success && typeof setup.script === 'string' ? setup.script : '',
        run: run?.success && typeof run.script === 'string' ? run.script : '',
        stop: stop?.success && typeof stop.script === 'string' ? stop.script : '',
        teardown: teardown?.success && typeof teardown.script === 'string' ? teardown.script : '',
      });
    });

    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  return scripts;
}

interface Task {
  id: string;
  name: string;
  branch: string;
  path: string;
  status: 'active' | 'idle' | 'running';
}

interface Props {
  task: Task | null;
  agent?: Agent;
  className?: string;
  projectPath?: string;
  remote?: {
    connectionId: string;
    projectPath?: string;
  };
  /** When true, a workspace connection is expected but not yet resolved. Terminals will show a loading state. */
  awaitingRemote?: boolean;
  defaultBranch?: string;
  portSeed?: string;
}

type LifecyclePhaseStatus = 'idle' | 'running' | 'succeeded' | 'failed';

const TaskTerminalPanelComponent: React.FC<Props> = ({
  task,
  agent,
  className,
  projectPath,
  remote,
  awaitingRemote,
  defaultBranch,
  portSeed,
}) => {
  const { effectiveTheme } = useTheme();
  const { toast } = useToast();

  // Use path in the key to differentiate multi-agent variants that share the same task.id
  const taskKey = task ? `${task.id}::${task.path}` : 'task-placeholder';
  const taskTerminals = useTaskTerminals(taskKey, task?.path);
  // Global terminals are scoped per variant (or project when no task) so each
  // agent worktree gets its own global terminal and simultaneous variants don't conflict.
  const effectiveCwd = projectPath;
  // Use a stable key for the home page case so terminals aren't orphaned.
  const globalKey = task?.path
    ? `global::${task.path}`
    : projectPath
      ? `global::${projectPath}`
      : 'global::home';
  const globalTerminals = useTaskTerminals(globalKey, effectiveCwd);

  const selection = useTerminalSelection({ task, taskTerminals, globalTerminals });

  // Custom project scripts from .emdash.json
  const customScripts = useCustomScripts(projectPath);
  const lifecycleScripts = useLifecycleScripts(projectPath);
  const customScriptNames = useMemo(() => Object.keys(customScripts), [customScripts]);
  // Track which script terminals are currently running
  const [runningScripts, setRunningScripts] = useState<Set<string>>(new Set());

  const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null);
  // Tracks which terminal needs a key bump to force re-attach after modal close
  const [reattachId, setReattachId] = useState<string | null>(null);
  const reattachCounter = useRef(0);
  const handleCloseExpandedTerminal = useCallback(() => {
    setReattachId(expandedTerminalId);
    reattachCounter.current += 1;
    setExpandedTerminalId(null);
  }, [expandedTerminalId]);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const terminalRefs = useRef<Map<string, { focus: () => void }>>(new Map());
  const setTerminalRef = useCallback((id: string, ref: { focus: () => void } | null) => {
    if (ref) {
      terminalRefs.current.set(id, ref);
    } else {
      terminalRefs.current.delete(id);
    }
  }, []);

  const expandableTerminal = useMemo(
    () =>
      getExpandableTerminalInfo({
        taskId: task?.id ?? null,
        taskName: task?.name ?? null,
        taskKey,
        projectPath,
        parsedMode: selection.parsed?.mode ?? null,
        activeTerminalId: selection.activeTerminalId,
        selectedLifecycle: selection.selectedLifecycle,
        selectedScript: selection.selectedScript,
      }),
    [
      task?.id,
      task?.name,
      taskKey,
      projectPath,
      selection.parsed?.mode,
      selection.activeTerminalId,
      selection.selectedLifecycle,
      selection.selectedScript,
    ]
  );

  // Small delay to ensure the terminal pane has rendered after visibility change
  useEffect(() => {
    const id = expandableTerminal.terminalId;
    if (!id) return;
    const timer = setTimeout(() => {
      terminalRefs.current.get(id)?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [expandableTerminal.terminalId]);

  const [runActionBusy, setRunActionBusy] = useState(false);
  const [phaseStatuses, setPhaseStatuses] = useState<Record<'setup' | 'run' | 'teardown', LifecyclePhaseStatus>>({
    setup: 'idle',
    run: 'idle',
    teardown: 'idle',
  });
  const runStopRequestedRef = useRef(false);

  const runStatus = phaseStatuses.run;
  const setupStatus = phaseStatuses.setup;
  const teardownStatus = phaseStatuses.teardown;

  const taskEnv = useMemo(() => {
    if (!task || !task.path || !projectPath) return undefined;
    return getTaskEnvVars({
      taskId: task.id,
      taskName: task.name,
      taskPath: task.path,
      projectPath,
      defaultBranch,
      portSeed,
    });
  }, [task?.id, task?.name, task?.path, projectPath, defaultBranch, portSeed]);

  useEffect(() => {
    setRunActionBusy(false);
    runStopRequestedRef.current = false;
    setPhaseStatuses({ setup: 'idle', run: 'idle', teardown: 'idle' });
    if (!task) return;

    const phaseKeys: Array<'setup' | 'run' | 'teardown'> = ['setup', 'run', 'teardown'];
    const disposers = phaseKeys.map((phase) =>
      window.electronAPI.onPtyExit(lifecycleTerminalId(task.id, phase), ({ exitCode }) => {
        setPhaseStatuses((prev) => ({
          ...prev,
          [phase]:
            phase === 'run' && runStopRequestedRef.current
              ? 'idle'
              : exitCode === 0
                ? 'succeeded'
                : 'failed',
        }));
        if (phase === 'run') {
          runStopRequestedRef.current = false;
        }
      })
    );

    return () => {
      for (const dispose of disposers) dispose();
    };
  }, [task?.id]);

  // Auto-switch dropdown to Run when the run phase first starts.
  const prevRunStatusRef = useRef(runStatus);
  useEffect(() => {
    const wasRunning = prevRunStatusRef.current === 'running';
    prevRunStatusRef.current = runStatus;
    if (runStatus === 'running' && !wasRunning) {
      selection.onChange('lifecycle::run');
    }
  }, [runStatus, selection.onChange]);

  const totalTerminals = taskTerminals.terminals.length + globalTerminals.terminals.length;

  const hasActiveTerminal = !selection.selectedLifecycle && !!selection.activeTerminalId;

  const canStartRun =
    !!task && !!projectPath && !runActionBusy && runStatus !== 'running' && !!lifecycleScripts.run;

  const selectedTerminalScope = useMemo(() => {
    if (selection.selectedScript) return 'SCRIPT';
    if (selection.parsed?.mode === 'task') return 'WORKTREE';
    if (selection.parsed?.mode === 'global') return projectPath ? 'PROJECT' : 'GLOBAL';
    return null;
  }, [selection.selectedScript, selection.parsed?.mode, projectPath]);
  const {
    isSearchOpen,
    searchQuery,
    searchStatus,
    searchInputRef,
    closeSearch,
    handleSearchQueryChange,
    stepSearch,
  } = useTerminalSearch({
    terminalId: selection.selectedLifecycle ? null : selection.activeTerminalId,
    containerRef: panelRef,
    enabled: hasActiveTerminal,
    onCloseFocus: () => {
      if (selection.activeTerminalId && !selection.selectedLifecycle) {
        terminalRefs.current.get(selection.activeTerminalId)?.focus();
      }
    },
  });

  const handlePlayPhase = useCallback(async (phase: 'setup' | 'run' | 'teardown') => {
    if (!task || !projectPath) return;
    const command = lifecycleScripts[phase];
    if (!command) return;

    const terminalId = lifecycleTerminalId(task.id, phase);
    selection.onChange(`lifecycle::${phase}`);
    if (phase === 'run') {
      runStopRequestedRef.current = false;
    }
    setPhaseStatuses((prev) => ({ ...prev, [phase]: 'running' }));

    window.setTimeout(() => {
      const api = window.electronAPI as any;
      api?.ptyInput?.({ id: terminalId, data: `${command}\r` });
    }, 300);
  }, [task?.id, task?.path, projectPath, selection.onChange, lifecycleScripts]);

  const handleStop = useCallback(async () => {
    if (!task) return;
    runStopRequestedRef.current = true;
    const api = window.electronAPI as any;
    api?.ptyInput?.({ id: lifecycleTerminalId(task.id, 'run'), data: '\x03' });
  }, [task?.id]);

  // --- Custom script play/stop ---
  const handleScriptPlay = useCallback(
    (scriptName: string) => {
      const command = customScripts[scriptName];
      if (!command) return;
      const termId = scriptTerminalId(taskKey, scriptName);
      // Small delay to ensure terminal is spawned before sending input
      setTimeout(() => {
        const api = window.electronAPI as any;
        api?.ptyInput?.({ id: termId, data: `${command}\r` });
      }, 300);
      setRunningScripts((prev) => new Set(prev).add(scriptName));
    },
    [customScripts, taskKey]
  );

  const handleScriptStop = useCallback(
    (scriptName: string) => {
      const termId = scriptTerminalId(taskKey, scriptName);
      const api = window.electronAPI as any;
      api?.ptyInput?.({ id: termId, data: '\x03' });
      setRunningScripts((prev) => {
        const next = new Set(prev);
        next.delete(scriptName);
        return next;
      });
    },
    [taskKey]
  );

  const handleScriptRestart = useCallback(
    (scriptName: string) => {
      const termId = scriptTerminalId(taskKey, scriptName);
      const api = window.electronAPI as any;
      api?.ptyInput?.({ id: termId, data: '\x03' });
      setTimeout(() => {
        const command = customScripts[scriptName];
        if (command) {
          api?.ptyInput?.({ id: termId, data: `${command}\r` });
        }
      }, 200);
    },
    [customScripts, taskKey]
  );

  const [nativeTheme, setNativeTheme] = useState<{
    background?: string;
    foreground?: string;
    cursor?: string;
    cursorAccent?: string;
    selectionBackground?: string;
    black?: string;
    red?: string;
    green?: string;
    yellow?: string;
    blue?: string;
    magenta?: string;
    cyan?: string;
    white?: string;
    brightBlack?: string;
    brightRed?: string;
    brightGreen?: string;
    brightYellow?: string;
    brightBlue?: string;
    brightMagenta?: string;
    brightCyan?: string;
    brightWhite?: string;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const result = await window.electronAPI.terminalGetTheme();
        if (result?.ok && result.config?.theme) setNativeTheme(result.config.theme);
      } catch (error) {
        console.warn('Failed to load native terminal theme', error);
      }
    })();
  }, []);

  const defaultTheme = useMemo(() => {
    const isMistral = agent === 'mistral';
    const darkBackground = isMistral ? '#202938' : '#1e1e1e';
    const blackBackground = isMistral ? '#141820' : '#000000';
    const grayBackground = isMistral ? '#282C33' : '#282C33';

    return effectiveTheme === 'dark' || effectiveTheme === 'dark-black' || effectiveTheme === 'dark-gray'
      ? {
          background: effectiveTheme === 'dark-black' ? blackBackground : effectiveTheme === 'dark-gray' ? grayBackground : darkBackground,
          foreground: '#d4d4d4',
          cursor: '#aeafad',
          cursorAccent: effectiveTheme === 'dark-black' ? blackBackground : effectiveTheme === 'dark-gray' ? grayBackground : darkBackground,
          selectionBackground: 'rgba(96, 165, 250, 0.35)',
          selectionForeground: '#f9fafb',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#ffffff',
        }
      : {
          background: '#ffffff',
          foreground: '#1e1e1e',
          cursor: '#1e1e1e',
          cursorAccent: '#ffffff',
          selectionBackground: 'rgba(59, 130, 246, 0.35)',
          selectionForeground: '#0f172a',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#bf8803',
          blue: '#0451a5',
          magenta: '#bc05bc',
          cyan: '#0598bc',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#cd3131',
          brightGreen: '#14ce14',
          brightYellow: '#b5ba00',
          brightBlue: '#0451a5',
          brightMagenta: '#bc05bc',
          brightCyan: '#0598bc',
          brightWhite: '#a5a5a5',
        };
  }, [effectiveTheme, agent]);

  const themeOverride = useMemo(() => {
    if (!nativeTheme) return defaultTheme;
    return { ...defaultTheme, ...nativeTheme };
  }, [nativeTheme, defaultTheme]);

  return (
    <div ref={panelRef} className={cn('flex h-full min-w-0 flex-col bg-card', className)}>
      <div className="flex items-center gap-2 border-b border-border bg-muted px-2 py-1.5 dark:bg-background">
        <Select
          value={selection.value}
          onValueChange={selection.onChange}
          open={selection.isOpen}
          onOpenChange={selection.setIsOpen}
        >
          <SelectTrigger className="h-7 min-w-0 flex-1 justify-between border-none bg-transparent px-2 text-left text-xs shadow-none">
            <span className="flex min-w-0 flex-1 items-center">
              <span className="mr-2 inline-flex w-4 shrink-0 justify-center text-[11px] leading-none text-muted-foreground/90">
                {'>_'}
              </span>
              <SelectValue placeholder="Select target" />
            </span>
          </SelectTrigger>
          <SelectContent>
            {task && (
              <SelectGroup>
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-[11px] font-bold text-muted-foreground">Worktree</span>
                  <button
                    type="button"
                    className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void (async () => {
                        const { captureTelemetry } = await import('../lib/telemetryClient');
                        captureTelemetry('terminal_new_terminal_created', { scope: 'task' });
                      })();
                      const newId = taskTerminals.createTerminal({ cwd: task?.path });
                      selection.onCreateTerminal('task', newId);
                    }}
                    title="New worktree terminal"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                {taskTerminals.terminals.map((terminal) => (
                  <SelectItem
                    key={`task::${terminal.id}`}
                    value={`task::${terminal.id}`}
                    className="text-xs font-normal pl-5"
                  >
                    {terminal.title}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}

            {(projectPath || !task) && (
              <>
                {task && (
                  <div className="my-1 border-t border-border" />
                )}
                <SelectGroup>
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-[11px] font-bold text-muted-foreground">
                      {projectPath ? 'Project' : 'Global'}
                    </span>
                    <button
                      type="button"
                      className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void (async () => {
                          const { captureTelemetry } = await import('../lib/telemetryClient');
                          captureTelemetry('terminal_new_terminal_created', {
                            scope: projectPath ? 'project' : 'global',
                          });
                        })();
                        const newId = globalTerminals.createTerminal({ cwd: effectiveCwd });
                        selection.onCreateTerminal('global', newId);
                      }}
                      title={projectPath ? 'New project terminal' : 'New global terminal'}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  {globalTerminals.terminals.map((terminal) => (
                    <SelectItem
                      key={`global::${terminal.id}`}
                      value={`global::${terminal.id}`}
                      className="text-xs font-normal pl-5"
                    >
                      {terminal.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
        {selectedTerminalScope && (
          <span className="shrink-0 rounded bg-zinc-500/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-400/15 dark:text-zinc-400">
            {selectedTerminalScope}
          </span>
        )}

        {/* Spacer to push actions to the right */}
        <div className="flex-1" />

        {/* --- Lifecycle & Script action buttons --- */}
        {task && (
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center">
              {/* Lifecycle phases — each with status dot, label, and its own play/stop */}
              {(['setup', 'run', 'teardown'] as const).map((phase, i) => {
                const status = phase === 'setup' ? setupStatus : phase === 'run' ? runStatus : teardownStatus;
                const label = phase.charAt(0).toUpperCase() + phase.slice(1);
                const isActive = selection.selectedLifecycle === phase;
                const isPhaseRunning = status === 'running';
                const canPlay = phase === 'run'
                  ? canStartRun && !!projectPath
                  : !!projectPath && !runActionBusy && status !== 'running';
                return (
                  <React.Fragment key={phase}>
                    {i > 0 && <div className="mx-1 h-4 w-px bg-border" />}
                    <div className="flex items-center gap-0">
                      {/* Label button — navigates to this phase's logs */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => selection.onChange(`lifecycle::${phase}`)}
                            className={cn(
                              'h-6 gap-1 rounded-r-none px-1.5 text-[11px] font-medium',
                              isActive && 'bg-accent',
                              status === 'running'
                                ? 'text-blue-500 dark:text-blue-400'
                                : status === 'succeeded'
                                  ? 'text-green-600 dark:text-green-400'
                                  : status === 'failed'
                                    ? 'text-red-500 dark:text-red-400'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {status === 'running' ? (
                              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" />
                            ) : status === 'succeeded' ? (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                            ) : status === 'failed' ? (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                            ) : (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400/50" />
                            )}
                            {label}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="text-xs">{label} — {status}</p>
                        </TooltipContent>
                      </Tooltip>
                      {/* Play/Stop button — always present, always in the same spot per phase */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {isPhaseRunning && phase === 'run' ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={handleStop}
                              disabled={runActionBusy}
                              className="h-6 w-6 rounded-l-none text-muted-foreground hover:text-destructive"
                            >
                              <Square className="h-3 w-3" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handlePlayPhase(phase)}
                              disabled={!canPlay || runActionBusy}
                              className={cn(
                                'h-6 w-6 rounded-l-none text-muted-foreground hover:text-foreground',
                                isActive && 'bg-accent',
                              )}
                            >
                              {phase === 'run' && setupStatus === 'failed' ? (
                                <RotateCw className="h-3 w-3" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="text-xs">
                            {isPhaseRunning && phase === 'run'
                              ? 'Stop run script'
                              : phase === 'run' && setupStatus === 'failed'
                                ? 'Retry setup & start run'
                                : `Run ${label.toLowerCase()} script`}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </React.Fragment>
                );
              })}

            </div>
          </TooltipProvider>
        )}

        {/* Divider before utility actions */}
        {(task || (selection.activeTerminalId && !selection.selectedLifecycle)) && (
          <div className="mx-0.5 h-4 w-px bg-border" />
        )}

        {/* Expand terminal to full-screen modal */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  if (expandableTerminal.terminalId) {
                    setExpandedTerminalId(expandableTerminal.terminalId);
                  }
                }}
                className="text-muted-foreground hover:text-foreground"
                disabled={!expandableTerminal.terminalId}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">
                {expandableTerminal.terminalId ? 'Expand terminal' : 'No terminal to expand'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {(() => {
          const canDelete =
            selection.parsed?.mode === 'task'
              ? taskTerminals.terminals.length > 1
              : selection.parsed?.mode === 'global'
                ? globalTerminals.terminals.length > 1
                : false;
          return (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      if (selection.activeTerminalId && selection.parsed && canDelete) {
                        void (async () => {
                          const { captureTelemetry } = await import('../lib/telemetryClient');
                          captureTelemetry('terminal_deleted');
                        })();
                        if (selection.parsed.mode === 'task') {
                          taskTerminals.closeTerminal(selection.activeTerminalId);
                        } else if (selection.parsed.mode === 'global') {
                          globalTerminals.closeTerminal(selection.activeTerminalId);
                        }
                      }
                    }}
                    className="text-muted-foreground hover:text-destructive"
                    disabled={!selection.activeTerminalId || !canDelete}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">
                    {canDelete ? 'Close terminal tab' : 'Cannot close selected item'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })()}
      </div>

      {/* Scripts row — shown below the toolbar when custom scripts exist */}
      {task && customScriptNames.length > 0 && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-2 py-1.5 dark:bg-background/50">
          <TooltipProvider delayDuration={200}>
            {customScriptNames.map((name, i) => {
              const isActive = selection.selectedScript === name;
              const isScriptRunning = runningScripts.has(name);
              return (
                <React.Fragment key={`script-row::${name}`}>
                  {i > 0 && <div className="mx-1 h-4 w-px bg-border" />}
                  <div
                    className={cn(
                      'flex items-center gap-0 overflow-hidden rounded-md',
                      isActive && 'bg-accent',
                    )}
                  >
                    {/* Label — navigates to this script's terminal */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => selection.onChange(`script::${name}`)}
                          className={cn(
                            'h-6 gap-1 rounded-none px-1.5 text-[11px] font-medium hover:bg-transparent',
                            isScriptRunning
                              ? 'text-blue-500 dark:text-blue-400'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {isScriptRunning ? (
                            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" />
                          ) : (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400/50" />
                          )}
                          {name}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="text-xs">{isScriptRunning ? `${name} (running)` : name}</p>
                      </TooltipContent>
                    </Tooltip>
                    {/* Play/Stop — always in the same spot per script */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {isScriptRunning ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleScriptStop(name)}
                            className="h-6 w-6 rounded-none text-muted-foreground hover:bg-transparent hover:text-destructive"
                          >
                            <Square className="h-3 w-3" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              selection.onChange(`script::${name}`);
                              handleScriptPlay(name);
                            }}
                            className="h-6 w-6 rounded-none text-muted-foreground hover:bg-transparent hover:text-foreground"
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                        )}
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="text-xs">{isScriptRunning ? `Stop ${name}` : `Run ${name}`}</p>
                      </TooltipContent>
                    </Tooltip>
                    {/* Restart — only when running */}
                    {isScriptRunning && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleScriptRestart(name)}
                            className="h-6 w-6 rounded-none text-muted-foreground hover:bg-transparent hover:text-foreground"
                          >
                            <RotateCw className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="text-xs">Restart {name}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </TooltipProvider>
        </div>
      )}

      {selection.selectedLifecycle ? (
        (() => {
          const phase = selection.selectedLifecycle;
          const terminalId = task ? lifecycleTerminalId(task.id, phase) : null;
          return (
            <div
              className={cn(
                'bw-terminal flex flex-1 flex-col overflow-hidden',
                effectiveTheme === 'dark' || effectiveTheme === 'dark-black' || effectiveTheme === 'dark-gray'
                  ? agent === 'mistral'
                    ? effectiveTheme === 'dark-black'
                      ? 'bg-[#141820]'
                      : effectiveTheme === 'dark-gray'
                        ? 'bg-[#282C33]'
                        : 'bg-[#202938]'
                    : 'bg-card'
                  : 'bg-white'
              )}
            >
              <div className="relative flex-1 overflow-hidden">
                {task && terminalId ? (
                  <TerminalPane
                    key={`${terminalId}${reattachId === terminalId ? `::${reattachCounter.current}` : ''}`}
                    ref={(r) => setTerminalRef(terminalId, r)}
                    id={terminalId}
                    cwd={task.path}
                    env={taskEnv}
                    variant={effectiveTheme === 'dark' || effectiveTheme === 'dark-black' || effectiveTheme === 'dark-gray' ? 'dark' : 'light'}
                    themeOverride={themeOverride}
                    className="h-full w-full"
                    keepAlive
                  />
                ) : null}
              </div>
            </div>
          );
        })()
      ) : selection.selectedScript ? (
        <div
          className={cn(
            'bw-terminal flex flex-1 flex-col overflow-hidden',
            effectiveTheme === 'dark' || effectiveTheme === 'dark-black' || effectiveTheme === 'dark-gray'
              ? agent === 'mistral'
                ? effectiveTheme === 'dark-black'
                  ? 'bg-[#141820]'
                  : effectiveTheme === 'dark-gray'
                    ? 'bg-[#282C33]'
                    : 'bg-[#202938]'
                : 'bg-card'
              : 'bg-white'
          )}
        >
          <div className="relative flex-1 overflow-hidden">
            {customScriptNames.map((name) => {
              const termId = scriptTerminalId(taskKey, name);
              const isActive = name === selection.selectedScript;
              return (
                <div
                  key={`script::${name}`}
                  className={cn(
                    'absolute inset-0 h-full w-full transition-opacity',
                    isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
                  )}
                >
                  <TerminalPane
                    key={`${termId}${reattachId === termId ? `::${reattachCounter.current}` : ''}`}
                    ref={(r) => setTerminalRef(termId, r)}
                    id={termId}
                    cwd={task?.path || projectPath}
                    env={taskEnv}
                    remote={
                      remote?.connectionId ? { connectionId: remote.connectionId } : undefined
                    }
                    variant={
                      effectiveTheme === 'dark' || effectiveTheme === 'dark-black' || effectiveTheme === 'dark-gray'
                        ? 'dark'
                        : 'light'
                    }
                    themeOverride={themeOverride}
                    className="h-full w-full"
                    keepAlive
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'bw-terminal flex flex-1 flex-col overflow-hidden',
            effectiveTheme === 'dark' || effectiveTheme === 'dark-black' || effectiveTheme === 'dark-gray'
              ? agent === 'mistral'
                ? effectiveTheme === 'dark-black'
                  ? 'bg-[#141820]'
                  : effectiveTheme === 'dark-gray'
                    ? 'bg-[#282C33]'
                    : 'bg-[#202938]'
                : 'bg-card'
              : 'bg-white'
          )}
        >
          <div className="relative flex-1 overflow-hidden">
            <TerminalSearchOverlay
              isOpen={isSearchOpen && hasActiveTerminal}
              searchQuery={searchQuery}
              searchStatus={searchStatus}
              searchInputRef={searchInputRef}
              onQueryChange={handleSearchQueryChange}
              onStep={stepSearch}
              onClose={closeSearch}
            />
            {awaitingRemote ? (
              <div className="flex h-full flex-col items-center justify-center text-xs text-muted-foreground">
                <p>Connecting to workspace...</p>
              </div>
            ) : (
              <>
                {task &&
                  taskTerminals.terminals.map((terminal) => {
                    const isActive =
                      selection.parsed?.mode === 'task' &&
                      terminal.id === selection.activeTerminalId;
                    return (
                      <div
                        key={`task::${terminal.id}`}
                        className={cn(
                          'absolute inset-0 h-full w-full transition-opacity',
                          isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
                        )}
                      >
                        <TerminalPane
                          key={`${terminal.id}${reattachId === terminal.id ? `::${reattachCounter.current}` : ''}`}
                          ref={(r) => setTerminalRef(terminal.id, r)}
                          id={terminal.id}
                          cwd={remote?.projectPath || terminal.cwd || task.path}
                          remote={
                            remote?.connectionId ? { connectionId: remote.connectionId } : undefined
                          }
                          env={taskEnv}
                          variant={
                            effectiveTheme === 'dark' || effectiveTheme === 'dark-black' || effectiveTheme === 'dark-gray'
                              ? 'dark'
                              : 'light'
                          }
                          themeOverride={themeOverride}
                          className="h-full w-full"
                          keepAlive
                        />
                      </div>
                    );
                  })}
                {globalTerminals.terminals.map((terminal) => {
                  const isActive =
                    selection.parsed?.mode === 'global' &&
                    terminal.id === selection.activeTerminalId;
                  return (
                    <div
                      key={`global::${terminal.id}`}
                      className={cn(
                        'absolute inset-0 h-full w-full transition-opacity',
                        isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
                      )}
                    >
                      <TerminalPane
                        key={`${terminal.id}${reattachId === terminal.id ? `::${reattachCounter.current}` : ''}`}
                        ref={(r) => setTerminalRef(terminal.id, r)}
                        id={terminal.id}
                        cwd={terminal.cwd || projectPath}
                        remote={
                          remote?.connectionId ? { connectionId: remote.connectionId } : undefined
                        }
                        variant={
                          effectiveTheme === 'dark' || effectiveTheme === 'dark-black' || effectiveTheme === 'dark-gray'
                            ? 'dark'
                            : 'light'
                        }
                        themeOverride={themeOverride}
                        className="h-full w-full"
                        keepAlive
                      />
                    </div>
                  );
                })}
                {totalTerminals === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-xs text-muted-foreground">
                    <p>No terminal found.</p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
      {/* Expanded terminal modal */}
      {expandedTerminalId && (
        <ExpandedTerminalModal
          terminalId={expandedTerminalId}
          title={expandableTerminal.title}
          onClose={handleCloseExpandedTerminal}
          variant={effectiveTheme === 'dark' || effectiveTheme === 'dark-black' || effectiveTheme === 'dark-gray' ? 'dark' : 'light'}
        />
      )}
    </div>
  );
};

export const TaskTerminalPanel = React.memo(TaskTerminalPanelComponent);

export default TaskTerminalPanel;
