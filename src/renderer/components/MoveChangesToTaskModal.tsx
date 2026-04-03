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
import { Spinner } from './ui/spinner';
import type { BaseModalProps } from '@/contexts/ModalProvider';
import type { Agent } from '@/types';
import type { Project, Task } from '@/types/app';
import { generateFriendlyTaskName, MAX_TASK_NAME_LENGTH, normalizeTaskName } from '@/lib/taskNames';

interface MoveChangesToTaskModalProps {
  onClose: () => void;
  initialProject: Project;
  sourceTask: Task;
  existingTaskNames: string[];
  defaultAgent: Agent;
  onCreateTask: (taskName: string) => Promise<void>;
}

export type MoveChangesToTaskModalOverlayProps = BaseModalProps<void> &
  Omit<MoveChangesToTaskModalProps, 'onClose'>;

export function MoveChangesToTaskModalOverlay({
  onClose,
  initialProject,
  sourceTask,
  existingTaskNames,
  defaultAgent,
  onCreateTask,
}: MoveChangesToTaskModalOverlayProps) {
  return (
    <MoveChangesToTaskModal
      onClose={onClose}
      initialProject={initialProject}
      sourceTask={sourceTask}
      existingTaskNames={existingTaskNames}
      defaultAgent={defaultAgent}
      onCreateTask={onCreateTask}
    />
  );
}

function MoveChangesToTaskModal({
  onClose,
  initialProject,
  sourceTask,
  existingTaskNames,
  defaultAgent,
  onCreateTask,
}: MoveChangesToTaskModalProps): JSX.Element {
  // debug: modal used for moving current branch changes into a fresh task/worktree
  const normalizedExisting = useMemo(
    () =>
      existingTaskNames
        .map((name) => normalizeTaskName(name))
        .filter((value): value is string => Boolean(value)),
    [existingTaskNames]
  );
  const [taskName, setTaskName] = useState(() => generateFriendlyTaskName(normalizedExisting));
  const [branch, setBranch] = useState(sourceTask.branch || initialProject.gitInfo.branch || '');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.electronAPI
      .getBranchStatus({ taskPath: sourceTask.path, taskId: sourceTask.id })
      .then((result) => {
        if (result?.success && result.branch) setBranch(result.branch);
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
      await onCreateTask(normalizeTaskName(taskName) || taskName);
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
          Creates a new task on a new branch/worktree from{' '}
          <span className="font-medium text-foreground">{branch || 'the current branch'}</span>{' '}
          and moves any uncommitted changes into it. Agent: {defaultAgent}
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
            className={
              error
                ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive'
                : ''
            }
          />
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="submit" disabled={isCreating} aria-busy={isCreating}>
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
