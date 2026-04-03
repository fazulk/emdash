import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { SlugInput } from './ui/slug-input';
import { AgentDropdown } from './AgentDropdown';
import { Spinner } from './ui/spinner';
import type { BaseModalProps } from '@/contexts/ModalProvider';
import type { Project, Task } from '@/types/app';
import type { Agent } from '@/types';
import { useTaskManagementContext } from '@/contexts/TaskManagementContext';
import { useAppSettings } from '@/contexts/AppSettingsProvider';
import { useCliAgentDetection } from '@/hooks/useCliAgentDetection';
import { filterDisabledProviders, getDisabledProviderIds } from '@/lib/agentAvailability';
import { generateFriendlyTaskName, MAX_TASK_NAME_LENGTH, normalizeTaskName } from '@/lib/taskNames';
import { PROVIDER_IDS, isValidProviderId } from '@shared/providers/registry';

const DEFAULT_AGENT: Agent = 'claude';

interface MoveChangesToTaskModalProps {
  onClose: () => void;
  initialProject: Project;
  sourceTask: Task;
}

export type MoveChangesToTaskModalOverlayProps = BaseModalProps<void> & {
  initialProject: Project;
  sourceTask: Task;
};

export function MoveChangesToTaskModalOverlay({
  onClose,
  initialProject,
  sourceTask,
}: MoveChangesToTaskModalOverlayProps) {
  return <MoveChangesToTaskModal onClose={onClose} initialProject={initialProject} sourceTask={sourceTask} />;
}

function MoveChangesToTaskModal({
  onClose,
  initialProject,
  sourceTask,
}: MoveChangesToTaskModalProps): JSX.Element {
  const { tasksByProjectId, handleCreateTaskFromCurrentBranch } = useTaskManagementContext();
  const { settings } = useAppSettings();
  const { cliAgents } = useCliAgentDetection();
  const disabledAgents = useMemo(() => getDisabledProviderIds(settings), [settings]);
  const enabledAgents = useMemo(
    () => filterDisabledProviders(PROVIDER_IDS, settings) as Agent[],
    [settings]
  );
  const detectedAgents = useMemo(
    () =>
      cliAgents
        .filter(
          (candidate) => candidate.status === 'connected' && !disabledAgents.includes(candidate.id)
        )
        .map((candidate) => candidate.id as Agent),
    [cliAgents, disabledAgents]
  );
  const availableAgents = detectedAgents.length > 0 ? detectedAgents : enabledAgents;
  const projectTasks = useMemo(() => tasksByProjectId[initialProject.id] ?? [], [
    initialProject.id,
    tasksByProjectId,
  ]);
  const normalizedExisting = useMemo(
    () =>
      projectTasks
        .map((task) => normalizeTaskName(task.name))
        .filter((value): value is string => Boolean(value)),
    [projectTasks]
  );
  const defaultTaskName = useMemo(
    () => generateFriendlyTaskName(normalizedExisting),
    [normalizedExisting]
  );
  const preferredAgent = useMemo(() => {
    const settingsAgent = settings?.defaultProvider;
    return isValidProviderId(settingsAgent) && availableAgents.includes(settingsAgent as Agent)
      ? (settingsAgent as Agent)
      : (availableAgents[0] ?? DEFAULT_AGENT);
  }, [availableAgents, settings?.defaultProvider]);

  const [taskName, setTaskName] = useState(defaultTaskName);
  const [agent, setAgent] = useState<Agent>(preferredAgent);
  const [branch, setBranch] = useState(sourceTask.branch || initialProject.gitInfo.branch || '');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedAgent = availableAgents.includes(agent) ? agent : preferredAgent;

  useEffect(() => {
    void window.electronAPI
      .getBranchStatus({ taskPath: sourceTask.path, taskId: sourceTask.id })
      .then((result) => {
        if (result?.success && result.branch) {
          setBranch(result.branch);
        }
      })
      .catch(() => {});
  }, [sourceTask.id, sourceTask.path]);

  const validate = (value: string): string | null => {
    const normalized = normalizeTaskName(value);
    if (!normalized) return 'Task name is required.';
    if (normalizedExisting.includes(normalized)) return 'A task with this name already exists.';
    if (normalized.length > MAX_TASK_NAME_LENGTH) {
      return `Task name is too long (max ${MAX_TASK_NAME_LENGTH} characters).`;
    }
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextError = validate(taskName);
    if (nextError) {
      setError(nextError);
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      await handleCreateTaskFromCurrentBranch(
        sourceTask,
        normalizeTaskName(taskName) || taskName,
        selectedAgent,
        initialProject
      );
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create task');
      setIsCreating(false);
    }
  };

  return (
    <DialogContent
      className="max-w-md"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        inputRef.current?.focus({ preventScroll: true });
      }}
      onInteractOutside={(event) => {
        if (isCreating) event.preventDefault();
      }}
      onEscapeKeyDown={(event) => {
        if (isCreating) event.preventDefault();
      }}
    >
      <DialogHeader>
        <DialogTitle>New Task from Current Branch</DialogTitle>
        <DialogDescription className="text-xs">
          Creates a new task on a new branch/worktree from <span className="font-medium text-foreground">{branch || 'the current branch'}</span> and moves any uncommitted changes into it.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="move-changes-task-name" className="mb-2 block">
            Task name
          </Label>
          <SlugInput
            ref={inputRef}
            id="move-changes-task-name"
            value={taskName}
            onChange={(value) => {
              setTaskName(value);
              setError(null);
            }}
            maxLength={MAX_TASK_NAME_LENGTH}
            placeholder="split-follow-up-work"
            aria-invalid={!!error}
            className={error ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive' : ''}
          />
        </div>

        <div className="flex items-center gap-4">
          <Label className="shrink-0">Agent</Label>
          <AgentDropdown
            value={selectedAgent}
            onChange={setAgent}
            installedAgents={availableAgents}
          />
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="submit" disabled={isCreating || availableAgents.length === 0} aria-busy={isCreating}>
            {isCreating ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Creating…
              </>
            ) : (
              'Create Task'
            )}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
