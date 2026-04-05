import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import FileChangesPanel from './FileChangesPanel';
import TaskTerminalPanel from './TaskTerminalPanel';
import { useRightSidebar } from './ui/right-sidebar';
import { agentAssets } from '@/providers/assets';
import { agentMeta } from '@/providers/meta';
import AgentLogo from './AgentLogo';
import type { Agent } from '../types';
import { TaskScopeProvider, useTaskScope } from './TaskScopeContext';
import { ChevronDown, ChevronRight, PanelLeft, Trash2 } from 'lucide-react';
import { rpc } from '@/lib/rpc';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { useWorkspaceConnection } from '../hooks/useWorkspaceConnection';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './ui/resizable';
import { RIGHT_SIDEBAR_VERTICAL_STORAGE_KEY } from '@/constants/layout';
import { useTaskManagementContext } from '@/contexts/TaskManagementContext';

export interface RightSidebarTask {
  id: string;
  projectId?: string;
  name: string;
  branch: string;
  path: string;
  status: 'active' | 'idle' | 'running';
  agentId?: string;
  metadata?: any;
}

interface RightSidebarProps extends React.HTMLAttributes<HTMLElement> {
  task: RightSidebarTask | null;
  projectPath?: string | null;
  projectRemoteConnectionId?: string | null;
  projectRemotePath?: string | null;
  projectDefaultBranch?: string | null;
  forceBorder?: boolean;
  onOpenChanges?: (filePath?: string, taskPath?: string) => void;
}

const RightSidebar: React.FC<RightSidebarProps> = ({
  task,
  projectPath,
  projectRemoteConnectionId,
  projectRemotePath,
  projectDefaultBranch,
  className,
  forceBorder = false,
  onOpenChanges,
  ...rest
}) => {
  const { collapsed } = useRightSidebar();
  const asideRef = useRef<HTMLElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [collapsedVariants, setCollapsedVariants] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ agent: Agent; name: string; path: string; worktreeId?: string; branch?: string } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { handleSelectTask } = useTaskManagementContext();

  // For workspace tasks, use the workspace connection instead of project-level
  const { connectionId: wsConnectionId, remotePath: wsRemotePath } = useWorkspaceConnection(task);
  const isWorkspaceTask = !!task?.metadata?.workspace;
  const effectiveConnectionId = wsConnectionId || projectRemoteConnectionId || null;
  const effectiveRemotePath = wsRemotePath || projectRemotePath || null;
  // When a workspace task is active but its connection hasn't resolved yet,
  // terminals should wait instead of starting a local session.
  const awaitingRemote = isWorkspaceTask && !wsConnectionId;

  const toggleVariantCollapsed = (variantKey: string) => {
    setCollapsedVariants((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(variantKey)) {
        newSet.delete(variantKey);
      } else {
        newSet.add(variantKey);
      }
      return newSet;
    });
  };

  React.useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Blur focused elements inside the sidebar (e.g. xterm textarea) on collapse.
  useEffect(() => {
    if (collapsed && asideRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement)?.blur();
    }
  }, [collapsed]);

  // Detect multi-agent variants in task metadata
  const variants: Array<{ agent: Agent; name: string; path: string; worktreeId?: string; branch?: string }> =
    (() => {
      try {
        const v = task?.metadata?.multiAgent?.variants || [];
        if (Array.isArray(v))
          return v
            .map((x: any) => ({
              agent: x?.agent as Agent,
              name: x?.name,
              path: x?.path,
              worktreeId: x?.worktreeId,
              branch: x?.branch as string | undefined,
            }))
            .filter((x) => x?.path);
      } catch {}
      return [];
    })();

  // Helper to generate display label with instance number if needed
  const getVariantDisplayLabel = (variant: { agent: Agent; name: string }): string => {
    const meta = agentMeta[variant.agent];
    const asset = agentAssets[variant.agent];
    const baseName = meta?.label || asset?.name || String(variant.agent);

    // Count how many variants use this agent
    const agentVariants = variants.filter((v) => v.agent === variant.agent);

    // If only one instance of this agent, just show base name
    if (agentVariants.length === 1) {
      return baseName;
    }

    // Multiple instances: extract instance number from variant name
    // variant.name format: "task-agent-1", "task-agent-2", etc.
    const match = variant.name.match(/-(\d+)$/);
    const instanceNum = match
      ? match[1]
      : String(agentVariants.findIndex((v) => v.name === variant.name) + 1);

    return `${baseName} #${instanceNum}`;
  };

  const buildStandaloneTaskFromVariant = (variant: typeof variants[number]) => ({
    id: variant.worktreeId || variant.path,
    projectId: task?.projectId || '',
    name: variant.name || task?.name || 'Task',
    branch: variant.branch || task?.branch || '',
    path: variant.path,
    status: 'idle' as const,
    agentId: variant.agent,
    useWorktree: true,
    metadata: {
      ...(task?.metadata || {}),
      movedFromMultiAgent: task?.id,
      multiAgent: null,
    },
  });

  const syncTasksCache = (
    projectId: string,
    updater: (tasks: RightSidebarTask[]) => RightSidebarTask[]
  ) => {
    queryClient.setQueryData<RightSidebarTask[]>(['tasks', projectId], (existing = []) =>
      updater(existing)
    );
  };

  const handleMoveToSidebar = async (variant: typeof variants[number]) => {
    if (!task || !variant.worktreeId) return;
    try {
      const projectId = task.projectId || '';
      const movedTask = buildStandaloneTaskFromVariant(variant);
      await rpc.db.saveTask(movedTask);

      const currentVariants = task.metadata?.multiAgent?.variants || [];
      const updatedVariants = currentVariants.filter(
        (v: any) => v.worktreeId !== variant.worktreeId
      );

      if (updatedVariants.length === 1) {
        const remainingRaw = updatedVariants[0];
        const remainingVariant =
          variants.find((v) => v.worktreeId === remainingRaw?.worktreeId) ||
          ({
            agent: remainingRaw?.agent as Agent,
            name: remainingRaw?.name || task.name,
            path: remainingRaw?.path || task.path,
            worktreeId: remainingRaw?.worktreeId,
            branch: remainingRaw?.branch || task.branch,
          } as (typeof variants)[number]);
        const remainingTask = buildStandaloneTaskFromVariant(remainingVariant);

        await rpc.db.saveTask(remainingTask);
        await rpc.db.deleteTask(task.id);

        syncTasksCache(projectId, (existing) => {
          const filtered = existing.filter(
            (candidate) =>
              candidate.id !== task.id &&
              candidate.id !== movedTask.id &&
              candidate.id !== remainingTask.id
          );
          return [remainingTask as RightSidebarTask, movedTask as RightSidebarTask, ...filtered];
        });
        handleSelectTask(remainingTask as any);
        toast({
          title: 'Moved to sidebar',
          description: `${getVariantDisplayLabel(remainingVariant)} is now a standalone task`,
        });
      } else {
        await rpc.db.saveTask({
          ...task,
          projectId,
          metadata: {
            ...task.metadata,
            multiAgent: {
              ...task.metadata?.multiAgent,
              variants: updatedVariants,
            },
          },
        });

        syncTasksCache(projectId, (existing) => {
          const filtered = existing.filter((candidate) => candidate.id !== movedTask.id);
          return filtered.map((candidate) =>
            candidate.id === task.id
              ? {
                  ...candidate,
                  metadata: {
                    ...candidate.metadata,
                    multiAgent: {
                      ...candidate.metadata?.multiAgent,
                      variants: updatedVariants,
                    },
                  },
                }
              : candidate
          ).concat(movedTask as RightSidebarTask);
        });
        toast({
          title: 'Moved to sidebar',
          description: `${getVariantDisplayLabel(variant)} is now a standalone task`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    } catch (err: any) {
      toast({
        title: 'Failed to move',
        description: err.message || 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteWorktree = async (variant: typeof variants[number]) => {
    if (!task || !projectPath) return;
    const projectId = task.projectId || '';
    const label = getVariantDisplayLabel(variant);

    const currentVariants = task.metadata?.multiAgent?.variants || [];
    const updatedVariants = currentVariants.filter(
      (v: any) => v.worktreeId !== variant.worktreeId
    );

    if (updatedVariants.length === 1) {
      const remainingRaw = updatedVariants[0];
      const remainingVariant =
        variants.find((v) => v.worktreeId === remainingRaw?.worktreeId) ||
        ({
          agent: remainingRaw?.agent as Agent,
          name: remainingRaw?.name || task.name,
          path: remainingRaw?.path || task.path,
          worktreeId: remainingRaw?.worktreeId,
          branch: remainingRaw?.branch || task.branch,
        } as (typeof variants)[number]);
      const remainingTask = buildStandaloneTaskFromVariant(remainingVariant);

      await rpc.db.saveTask(remainingTask);
      await rpc.db.deleteTask(task.id);

      syncTasksCache(projectId, (existing) => {
        const filtered = existing.filter(
          (candidate) => candidate.id !== task.id && candidate.id !== remainingTask.id
        );
        return [remainingTask as RightSidebarTask, ...filtered];
      });
      handleSelectTask(remainingTask as any);
      toast({
        title: 'Moved to sidebar',
        description: `${getVariantDisplayLabel(remainingVariant)} is now a standalone task`,
      });
    } else {
      await rpc.db.saveTask({
        ...task,
        projectId,
        metadata: {
          ...task.metadata,
          multiAgent: {
            ...task.metadata?.multiAgent,
            variants: updatedVariants,
          },
        },
      });

      syncTasksCache(projectId, (existing) =>
        existing.map((candidate) =>
          candidate.id === task.id
            ? {
                ...candidate,
                metadata: {
                  ...candidate.metadata,
                  multiAgent: {
                    ...candidate.metadata?.multiAgent,
                    variants: updatedVariants,
                  },
                },
              }
            : candidate
        )
      );
    }

    queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    setConfirmDelete(null);

    // Clean up pty and worktree in the background
    (async () => {
      try {
        try {
          window.electronAPI.ptyKill(`${variant.worktreeId}-main`);
        } catch {}

        await window.electronAPI.worktreeRemove({
          projectPath,
          worktreeId: variant.worktreeId || '',
          worktreePath: variant.path,
          branch: variant.branch,
        });
      } catch (err: any) {
        toast({
          title: 'Failed to clean up worktree',
          description: `${label}: ${err.message || 'Unknown error'}`,
          variant: 'destructive',
        });
      }
    })();
  };

  return (
    <aside
      ref={asideRef}
      data-state={collapsed ? 'collapsed' : 'open'}
      className={cn(
        'group/right-sidebar relative z-[45] flex h-full w-full min-w-0 flex-shrink-0 flex-col overflow-hidden transition-all duration-200 ease-linear',
        forceBorder
          ? 'bg-background'
          : 'border-l border-border bg-muted/10 data-[state=collapsed]:border-l-0',
        'data-[state=collapsed]:pointer-events-none',
        className
      )}
      style={
        forceBorder
          ? {
              borderLeft: collapsed
                ? 'none'
                : isDarkMode
                  ? '2px solid rgb(63, 63, 70)'
                  : '2px solid rgb(228, 228, 231)',
              boxShadow: collapsed
                ? 'none'
                : isDarkMode
                  ? '-2px 0 8px rgba(0,0,0,0.5)'
                  : '-2px 0 8px rgba(0,0,0,0.1)',
            }
          : undefined
      }
      aria-hidden={collapsed}
      {...rest}
    >
      <TaskScopeProvider
        value={{
          taskId: task?.id,
          taskPath: task?.path,
          projectPath,
          prNumber: task?.metadata?.prNumber ?? undefined,
        }}
      >
        <div className="flex h-full w-full min-w-0 flex-col">
          {task || projectPath ? (
            <div className="flex h-full flex-col">
              {task && variants.length > 1 ? (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {variants.map((v, i) => {
                    const variantKey = `${v.agent}-${i}`;
                    const isCollapsed = collapsedVariants.has(variantKey);
                    return (
                      <div
                        key={variantKey}
                        className="mb-2 border-b border-border last:mb-0 last:border-b-0"
                      >
                        <div className="flex w-full min-w-0 items-center justify-between bg-muted px-3 py-2 text-xs font-medium text-foreground dark:bg-background">
                          <button
                            type="button"
                            onClick={() => toggleVariantCollapsed(variantKey)}
                            className="inline-flex min-w-0 cursor-pointer items-center gap-2 hover:opacity-80"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            {(() => {
                              const asset = agentAssets[v.agent as keyof typeof agentAssets];
                              const meta = (agentMeta as any)[v.agent] as
                                | { label?: string }
                                | undefined;
                              return (
                                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] font-medium">
                                  {asset?.logo ? (
                                    <AgentLogo
                                      logo={asset.logo}
                                      alt={asset.alt || meta?.label || String(v.agent)}
                                      isSvg={asset.isSvg}
                                      invertInDark={asset.invertInDark}
                                      className="h-3.5 w-3.5"
                                    />
                                  ) : null}
                                  {getVariantDisplayLabel(v)}
                                </span>
                              );
                            })()}
                            <span className="truncate" title={v.name}>
                              {v.name}
                            </span>
                          </button>
                          <TooltipProvider delayDuration={300}>
                            <div className="ml-2 flex shrink-0 items-center gap-0.5">
                              {v.worktreeId && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleMoveToSidebar(v);
                                      }}
                                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground dark:hover:bg-muted/30"
                                    >
                                      <PanelLeft className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left">
                                    <p>Move to sidebar</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmDelete(v);
                                    }}
                                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                  <p>Delete worktree</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
                        </div>
                        {!isCollapsed && (
                          <TaskScopeProvider
                            value={{ taskId: task.id, taskPath: v.path, projectPath }}
                          >
                            <VariantChangesIfAny
                              path={v.path}
                              taskId={task.id}
                              onOpenChanges={onOpenChanges}
                            />
                            <TaskTerminalPanel
                              task={{
                                ...task,
                                path: v.path,
                                name: v.name || task.name,
                              }}
                              agent={v.agent}
                              projectPath={projectPath || task?.path}
                              remote={
                                effectiveConnectionId
                                  ? {
                                      connectionId: effectiveConnectionId,
                                      projectPath: effectiveRemotePath || projectPath || undefined,
                                    }
                                  : undefined
                              }
                              awaitingRemote={awaitingRemote}
                              defaultBranch={projectDefaultBranch || undefined}
                              portSeed={v.worktreeId}
                              className="min-h-[200px]"
                            />
                          </TaskScopeProvider>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : task && variants.length === 1 ? (
                (() => {
                  const v = variants[0];
                  const derived = {
                    ...task,
                    path: v.path,
                    name: v.name || task.name,
                  } as any;
                  return (
                    <ResizablePanelGroup
                      direction="vertical"
                      autoSaveId={RIGHT_SIDEBAR_VERTICAL_STORAGE_KEY}
                    >
                      <ResizablePanel defaultSize={50} minSize={20}>
                        <VariantChangesIfAny
                          path={v.path}
                          taskId={task.id}
                          className="h-full min-h-0"
                          onOpenChanges={onOpenChanges}
                        />
                      </ResizablePanel>
                      <ResizableHandle />
                      <ResizablePanel defaultSize={50} minSize={20}>
                        <TaskTerminalPanel
                          task={derived}
                          agent={v.agent}
                          projectPath={projectPath || task?.path}
                          remote={
                            effectiveConnectionId
                              ? {
                                  connectionId: effectiveConnectionId,
                                  projectPath: effectiveRemotePath || projectPath || undefined,
                                }
                              : undefined
                          }
                          awaitingRemote={awaitingRemote}
                          defaultBranch={projectDefaultBranch || undefined}
                          portSeed={v.worktreeId}
                          className="h-full min-h-0"
                        />
                      </ResizablePanel>
                    </ResizablePanelGroup>
                  );
                })()
              ) : task ? (
                <SingleTaskSidebar
                  task={task}
                  projectPath={projectPath}
                  effectiveConnectionId={effectiveConnectionId}
                  effectiveRemotePath={effectiveRemotePath}
                  awaitingRemote={awaitingRemote}
                  projectDefaultBranch={projectDefaultBranch}
                  onOpenChanges={onOpenChanges}
                />
              ) : (
                <ResizablePanelGroup
                  direction="vertical"
                  autoSaveId={RIGHT_SIDEBAR_VERTICAL_STORAGE_KEY}
                >
                  <ResizablePanel defaultSize={50} minSize={20}>
                    <div className="flex h-full flex-col bg-background">
                      <div className="border-b border-border bg-muted px-3 py-2 text-sm font-medium text-foreground dark:bg-background">
                        <span className="whitespace-nowrap">Changes</span>
                      </div>
                      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                          Select a task to review file changes.
                        </span>
                      </div>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle />
                  <ResizablePanel defaultSize={50} minSize={20}>
                    <TaskTerminalPanel
                      task={null}
                      agent={undefined}
                      projectPath={projectPath || undefined}
                      remote={
                        effectiveConnectionId
                          ? {
                              connectionId: effectiveConnectionId,
                              projectPath: effectiveRemotePath || projectPath || undefined,
                            }
                          : undefined
                      }
                      defaultBranch={projectDefaultBranch || undefined}
                      className="h-full min-h-0"
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              )}
            </div>
          ) : (
            <TaskTerminalPanel task={null} agent={undefined} className="h-full min-h-0" />
          )}
        </div>
      </TaskScopeProvider>

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete worktree?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{confirmDelete && getVariantDisplayLabel(confirmDelete)}</strong>&apos;s
              worktree and all its uncommitted changes. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) void handleDeleteWorktree(confirmDelete);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
};

export default RightSidebar;

const SingleTaskSidebar: React.FC<{
  task: RightSidebarTask;
  projectPath?: string | null;
  effectiveConnectionId?: string | null;
  effectiveRemotePath?: string | null;
  awaitingRemote?: boolean;
  projectDefaultBranch?: string | null;
  onOpenChanges?: (filePath?: string, taskPath?: string) => void;
}> = ({
  task,
  projectPath,
  effectiveConnectionId,
  effectiveRemotePath,
  awaitingRemote,
  projectDefaultBranch,
  onOpenChanges,
}) => {
  return (
    <ResizablePanelGroup direction="vertical" autoSaveId={RIGHT_SIDEBAR_VERTICAL_STORAGE_KEY}>
      <ResizablePanel defaultSize={50} minSize={20}>
        <FileChangesPanel className="h-full min-h-0" onOpenChanges={onOpenChanges} />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50} minSize={20}>
        <TaskTerminalPanel
          task={task}
          agent={task.agentId as Agent}
          projectPath={projectPath || task?.path}
          remote={
            effectiveConnectionId
              ? {
                  connectionId: effectiveConnectionId,
                  projectPath: effectiveRemotePath || projectPath || undefined,
                }
              : undefined
          }
          awaitingRemote={awaitingRemote}
          defaultBranch={projectDefaultBranch || undefined}
          className="h-full min-h-0"
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

const VariantChangesIfAny: React.FC<{
  path: string;
  taskId: string;
  className?: string;
  onOpenChanges?: (filePath?: string, taskPath?: string) => void;
}> = ({ path, taskId, className, onOpenChanges }) => {
  const { projectPath } = useTaskScope();
  return (
    <TaskScopeProvider value={{ taskId, taskPath: path, projectPath }}>
      <FileChangesPanel className={className || 'min-h-0'} onOpenChanges={onOpenChanges} />
    </TaskScopeProvider>
  );
};
