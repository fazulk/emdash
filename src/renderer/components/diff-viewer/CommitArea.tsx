import React, { useCallback, useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Undo2, Loader2, GitBranchPlus, ChevronDown } from '@/components/icons/lucide';
import { useGitWorkspaceBusyForTask } from '../../contexts/GitWorkspaceBusyContext';
import { useToast } from '../../hooks/use-toast';
import type { FileChange } from '../../hooks/useFileChanges';
import { subscribeToFileChanges } from '../../lib/fileChangeEvents';
import { useTaskManagementContext } from '../../contexts/TaskManagementContext';
import { useProjectManagementContext } from '../../contexts/ProjectManagementProvider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

interface CommitAreaProps {
  taskPath?: string;
  fileChanges: FileChange[];
  onRefreshChanges?: () => Promise<void> | void;
}

interface LatestCommit {
  hash: string;
  subject: string;
  body: string;
  isPushed: boolean;
}

function CommitMessageToastDescription({ message }: { message: string }) {
  return (
    <div className="space-y-2">
      <p>Changes committed with message:</p>
      <code className="block whitespace-pre-wrap break-words rounded-md border border-border/70 bg-muted/60 px-2 py-1.5 font-mono text-xs text-foreground">
        {message}
      </code>
    </div>
  );
}


function friendlyGitError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('non-fast-forward') || s.includes('tip of your current branch is behind'))
    return 'Remote has new commits. Pull before pushing.';
  if (s.includes('merge conflict') || s.includes('fix conflicts'))
    return 'Merge conflicts detected. Resolve them in your editor.';
  if (s.includes('permission denied') || s.includes('authentication'))
    return 'Authentication failed. Check your credentials.';
  if (s.includes('could not resolve host') || s.includes('unable to access'))
    return 'Cannot reach remote. Check your network connection.';
  if (s.includes('stale info'))
    return 'Remote changed since your last fetch. Pull or fetch before force pushing.';
  if (s.includes('no such remote')) return 'No remote configured for this repository.';
  if (s.includes('cannot undo the initial commit')) return 'Cannot undo the initial commit.';
  if (s.includes('nothing to commit')) return 'Nothing to commit.';
  // Return first meaningful line, capped
  const firstLine = raw.split('\n').find((l) => l.trim().length > 0) || raw;
  return firstLine.length > 120 ? firstLine.slice(0, 120) + '...' : firstLine;
}

export const CommitArea: React.FC<CommitAreaProps> = ({
  taskPath,
  fileChanges,
  onRefreshChanges,
}) => {
  const { toast } = useToast();
  const { selectedProject } = useProjectManagementContext();
  const { activeTask, handleOpenCreateTaskFromCurrentBranchModal } = useTaskManagementContext();
  const { operation, beginOperation, endOperation, isLocked } = useGitWorkspaceBusyForTask(taskPath);
  const [commitMessage, setCommitMessage] = useState('');
  const [description, setDescription] = useState('');
  const [branch, setBranch] = useState<string | null>(null);
  const [latestCommit, setLatestCommit] = useState<LatestCommit | null>(null);
  const [aheadCount, setAheadCount] = useState(0);
  const [behindCount, setBehindCount] = useState(0);
  const [showForcePushConfirm, setShowForcePushConfirm] = useState(false);
  const [showUndoPushedConfirm, setShowUndoPushedConfirm] = useState(false);

  const hasStagedFiles = fileChanges.some((f) => f.isStaged);
  const hasOnlyUnstagedChanges = fileChanges.length > 0 && !hasStagedFiles;
  const canCreateTaskFromCurrentBranch =
    !!selectedProject &&
    !!activeTask &&
    activeTask.path === taskPath &&
    !activeTask.metadata?.workspace &&
    (activeTask.metadata?.multiAgent?.variants?.length ?? 0) === 0;
  const isPushing = operation === 'push';
  const canCommit = hasStagedFiles && !isLocked;

  const fetchBranch = useCallback(async () => {
    if (!taskPath) return;
    const result = await window.electronAPI.getBranchStatus({ taskPath });
    if (result.success) {
      if (result.branch) setBranch(result.branch);
      if (typeof result.ahead === 'number') setAheadCount(result.ahead);
      if (typeof result.behind === 'number') setBehindCount(result.behind);
    }
  }, [taskPath]);

  const fetchLatestCommit = useCallback(async () => {
    if (!taskPath) return;
    const result = await window.electronAPI.gitGetLatestCommit({ taskPath });
    if (result.success) {
      setLatestCommit(result.commit ?? null);
    }
  }, [taskPath]);

  useEffect(() => {
    void fetchBranch();
    void fetchLatestCommit();
  }, [fetchBranch, fetchLatestCommit]);

  // Refresh branch status when file changes are detected (external git operations, watchers)
  useEffect(() => {
    if (!taskPath) return;
    return subscribeToFileChanges((event) => {
      if (event.detail.taskPath === taskPath) {
        void fetchBranch();
        void fetchLatestCommit();
      }
    });
  }, [taskPath, fetchBranch, fetchLatestCommit]);

  useEffect(() => {
    if (!taskPath || !window.electronAPI.onGitStatusChanged) return;
    return window.electronAPI.onGitStatusChanged((event) => {
      if (event?.taskPath !== taskPath) return;
      void fetchBranch();
      void fetchLatestCommit();
      void onRefreshChanges?.();
    });
  }, [taskPath, fetchBranch, fetchLatestCommit, onRefreshChanges]);

  const handleCommit = async (action: 'commit' | 'commitAndPush') => {
    if (!taskPath || (!hasStagedFiles && !hasOnlyUnstagedChanges) || isLocked) return;
    beginOperation(action);
    try {
      const subject = commitMessage.trim();
      const body = description.trim();
      if (hasOnlyUnstagedChanges) {
        await window.electronAPI.updateIndex({ taskPath, action: 'stage', scope: 'all' });
      }
      const result =
        action === 'commitAndPush'
          ? await window.electronAPI.gitCommitAndPush({
              taskPath,
              commitMessage: subject || undefined,
              body: body || undefined,
              createBranchIfOnDefault: false,
            })
          : await window.electronAPI.gitCommit({
              taskPath,
              message: subject || undefined,
              body: body || undefined,
            });
      if (result.success) {
        const committedMessage = result.message || subject;
        setCommitMessage('');
        setDescription('');
        await onRefreshChanges?.();
        await fetchLatestCommit();
        await fetchBranch();
        toast({
          title: action === 'commitAndPush' ? 'Committed and Pushed' : 'Committed',
          description: committedMessage
            ? <CommitMessageToastDescription message={committedMessage} />
            : 'Changes committed successfully.',
          descriptionClassName: committedMessage ? 'line-clamp-none opacity-100' : undefined,
        });
      } else {
        toast({
          title: action === 'commitAndPush' ? 'Commit & push failed' : 'Commit failed',
          description: friendlyGitError(result?.error || 'Unknown error'),
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: action === 'commitAndPush' ? 'Commit & push failed' : 'Commit failed',
        description: friendlyGitError(err instanceof Error ? err.message : String(err)),
        variant: 'destructive',
      });
    } finally {
      endOperation();
    }
  };

  const hasUnpushed = aheadCount > 0 || (latestCommit != null && !latestCommit.isPushed);
  const canForcePush = !!taskPath && !isLocked;

  const handlePush = async (force = false) => {
    if (!taskPath || isLocked || (!force && !hasUnpushed)) return;
    beginOperation('push');
    try {
      const result = await window.electronAPI.gitPush({ taskPath, force: force || undefined });
      if (result?.success) {
        toast({ title: force ? 'Force pushed successfully' : 'Pushed successfully' });
      } else {
        toast({
          title: force ? 'Force push failed' : 'Push failed',
          description: friendlyGitError(result?.error || 'Unknown error'),
          variant: 'destructive',
        });
      }
      await fetchBranch();
      await fetchLatestCommit();
    } catch (err) {
      toast({
        title: force ? 'Force push failed' : 'Push failed',
        description: friendlyGitError(err instanceof Error ? err.message : String(err)),
        variant: 'destructive',
      });
    } finally {
      endOperation();
    }
  };

  const handlePull = async () => {
    if (!taskPath || isLocked) return;
    beginOperation('pull');
    try {
      const result = await window.electronAPI.gitPull({ taskPath });
      if (!result?.success) {
        toast({
          title: 'Pull failed',
          description: friendlyGitError(result?.error || 'Unknown error'),
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Pulled successfully' });
      }
      await fetchBranch();
      await fetchLatestCommit();
      await onRefreshChanges?.();
    } catch (err) {
      toast({
        title: 'Pull failed',
        description: friendlyGitError(err instanceof Error ? err.message : String(err)),
        variant: 'destructive',
      });
    } finally {
      endOperation();
    }
  };

  const handleUndo = async (allowPushed = false) => {
    if (!taskPath || isLocked) return;
    const undoingPushedCommit = allowPushed || latestCommit?.isPushed === true;
    beginOperation('undo');
    try {
      const result = await window.electronAPI.gitSoftReset({
        taskPath,
        allowPushed: allowPushed || undefined,
      });
      if (result.success) {
        if (result.subject) setCommitMessage(result.subject);
        if (result.body) setDescription(result.body);
        await onRefreshChanges?.();
        await fetchLatestCommit();
        await fetchBranch();
        toast({
          title: undoingPushedCommit ? 'Commit undone locally' : 'Commit undone',
          description: undoingPushedCommit
            ? `${result.subject || 'The last commit was undone.'} Force push to update origin.`
            : result.subject || 'The last commit was moved back to staged changes.',
        });
      } else {
        toast({
          title: 'Undo failed',
          description: friendlyGitError(result?.error || 'Unknown error'),
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Undo failed',
        description: friendlyGitError(err instanceof Error ? err.message : String(err)),
        variant: 'destructive',
      });
    } finally {
      endOperation();
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border p-3">
      {/* Branch name */}
      {branch && (
        <span className="truncate text-xs text-muted-foreground" title={branch}>
          On branch <span className="font-medium text-foreground">{branch}</span>
        </span>
      )}

      {/* Commit message input */}
      <input
        type="text"
        value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        placeholder="Leave blank to auto generate..."
        disabled={isLocked}
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && canCommit) {
            void handleCommit('commit');
          }
        }}
      />

      {/* Description textarea */}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        rows={3}
        disabled={isLocked}
        className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />

      {canCreateTaskFromCurrentBranch && activeTask ? (
        <button
          type="button"
          onClick={() => handleOpenCreateTaskFromCurrentBranchModal(selectedProject, activeTask)}
          disabled={isLocked}
          className="flex items-center justify-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GitBranchPlus className="h-3.5 w-3.5" />
          New Task from Branch
        </button>
      ) : null}

      {/* Commit & Push & Pull buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => void handleCommit('commit')}
          disabled={(!hasStagedFiles && !hasOnlyUnstagedChanges) || isLocked}
          className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {operation === 'commit' ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin [animation-duration:0.25s]" />
              Committing...
            </>
          ) : (
            'Commit'
          )}
        </button>
        <button
          onClick={() => void handleCommit('commitAndPush')}
          disabled={(!hasStagedFiles && !hasOnlyUnstagedChanges) || isLocked}
          className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {operation === 'commitAndPush' ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin [animation-duration:0.25s]" />
              Committing...
            </>
          ) : (
            'Commit & Push'
          )}
        </button>
        <div className="flex flex-1">
          <button
            onClick={() => void handlePush()}
            disabled={!hasUnpushed || isLocked}
            className="flex flex-1 items-center justify-center gap-1 rounded-l-md rounded-r-none border border-border border-r-0 bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            title={
              hasUnpushed
                ? `Push${aheadCount > 0 ? ` ${aheadCount} commit${aheadCount > 1 ? 's' : ''}` : ''}`
                : 'No unpushed commits'
            }
          >
            {isPushing ? (
              <Loader2 className="h-3 w-3 animate-spin [animation-duration:0.25s]" />
            ) : (
              <ArrowUp className="h-3 w-3" />
            )}
            {isPushing ? 'Pushing...' : <>Push{aheadCount > 0 ? ` (${aheadCount})` : ''}</>}
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={!canForcePush}
                className="flex items-center justify-center rounded-r-md border border-border bg-background px-2 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                title="More push actions"
                aria-label="More push actions"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1">
              <button
                type="button"
                className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-accent"
                onClick={() => setShowForcePushConfirm(true)}
              >
                Force push to origin
              </button>
            </PopoverContent>
          </Popover>
        </div>
        {behindCount > 0 && (
          <button
            onClick={() => void handlePull()}
            disabled={isLocked}
            className="flex items-center justify-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            title={`Pull ${behindCount} commit${behindCount > 1 ? 's' : ''} from remote`}
          >
            <ArrowDown className="h-3 w-3" />
            Pull ({behindCount})
          </button>
        )}
      </div>

      {/* Separator — full width edge to edge */}
      <hr className="-mx-3 border-border" />

      {/* Latest commit */}
      {latestCommit && (
        <div className="flex items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
            title={latestCommit.subject}
          >
            {latestCommit.subject}
          </span>
          <button
            onClick={() => {
              if (latestCommit.isPushed) {
                setShowUndoPushedConfirm(true);
                return;
              }
              void handleUndo();
            }}
            disabled={isLocked}
            className="flex flex-shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title={latestCommit.isPushed ? 'Undo last pushed commit' : 'Undo last commit'}
          >
            <Undo2 className="h-3 w-3" />
            Undo
          </button>
        </div>
      )}
      <AlertDialog open={showForcePushConfirm} onOpenChange={setShowForcePushConfirm}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Force push this branch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will rewrite the remote branch with your current local HEAD using{' '}
              <code className="font-mono text-xs">--force-with-lease</code>. It is safer than a
              plain force push, but it can still replace commits on origin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setShowForcePushConfirm(false);
                void handlePush(true);
              }}
            >
              Force push
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showUndoPushedConfirm} onOpenChange={setShowUndoPushedConfirm}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Undo pushed commit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the latest commit from your local branch and move its changes back
              to staged files. Because the commit is already on origin, you will need to force push
              afterward to update the remote branch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setShowUndoPushedConfirm(false);
                void handleUndo(true);
              }}
            >
              Undo locally
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
