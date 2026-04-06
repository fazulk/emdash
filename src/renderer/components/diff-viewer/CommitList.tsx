import React, { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { ArrowUp, Loader2, Tag, Undo2 } from '@/components/icons/lucide';
import { useToast } from '../../hooks/use-toast';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../ui/context-menu';
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

interface Commit {
  hash: string;
  subject: string;
  body: string;
  author: string;
  authorEmail: string;
  date: string;
  isPushed: boolean;
  tags: string[];
}

export interface CommitInfo {
  hash: string;
  subject: string;
  body: string;
  author: string;
}

interface CommitListProps {
  taskPath?: string;
  selectedCommit: string | null;
  onSelectCommit: (commit: CommitInfo) => void;
}

const PAGE_SIZE = 50;

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr || '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
}

/** Try to extract a GitHub username from an email address. */
function githubLoginFromEmail(email: string): string | null {
  if (!email) return null;
  // GitHub noreply: 12345+username@users.noreply.github.com
  const noreply = email.match(/^\d+\+([^@]+)@users\.noreply\.github\.com$/i);
  if (noreply) return noreply[1];
  // Older noreply: username@users.noreply.github.com
  const oldNoreply = email.match(/^([^@]+)@users\.noreply\.github\.com$/i);
  if (oldNoreply) return oldNoreply[1];
  return null;
}

function getAvatarUrl(author: string, authorEmail: string): string {
  const login = githubLoginFromEmail(authorEmail);
  if (login) return `https://github.com/${login}.png?size=40`;
  // Fall back to trying the author name as a GitHub username
  return `https://github.com/${author}.png?size=40`;
}

function AuthorAvatar({ author, authorEmail }: { author: string; authorEmail: string }) {
  const [failed, setFailed] = useState(false);

  const url = getAvatarUrl(author, authorEmail);

  if (failed) return null;

  return (
    <img
      src={url}
      alt=""
      className="h-4 w-4 shrink-0 rounded-sm"
      onError={(e: SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.style.display = 'none';
        setFailed(true);
      }}
    />
  );
}

function friendlyGitError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('cannot undo the initial commit')) return 'Cannot undo the initial commit.';
  if (s.includes('cannot undo a commit that has already been pushed')) {
    return 'Cannot undo a commit that has already been pushed.';
  }
  const firstLine = raw.split('\n').find((l) => l.trim().length > 0) || raw;
  return firstLine.length > 120 ? firstLine.slice(0, 120) + '...' : firstLine;
}

export const CommitList: React.FC<CommitListProps> = ({
  taskPath,
  selectedCommit,
  onSelectCommit,
}) => {
  const { toast } = useToast();
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [aheadCount, setAheadCount] = useState<number | undefined>(undefined);
  const [undoingCommitHash, setUndoingCommitHash] = useState<string | null>(null);
  const [confirmUndoPushedCommit, setConfirmUndoPushedCommit] = useState<Commit | null>(null);

  const onSelectCommitRef = useRef(onSelectCommit);
  onSelectCommitRef.current = onSelectCommit;

  const loadInitialCommits = useCallback(async () => {
    if (!taskPath) {
      setCommits([]);
      setHasMore(false);
      setAheadCount(undefined);
      return;
    }

    setLoading(true);
    try {
      const res = await window.electronAPI.gitGetLog({ taskPath, maxCount: PAGE_SIZE });
      if (!res?.success || !res.commits) return;

      setCommits(res.commits);
      setAheadCount(res.aheadCount);
      setHasMore(res.commits.length >= PAGE_SIZE);

      const nextSelected = selectedCommit
        ? res.commits.find((commit) => commit.hash === selectedCommit) ?? null
        : null;
      const fallback = res.commits[0] ?? null;
      const commitToSelect = nextSelected ?? fallback;

      if (commitToSelect && commitToSelect.hash !== selectedCommit) {
        onSelectCommitRef.current({
          hash: commitToSelect.hash,
          subject: commitToSelect.subject,
          body: commitToSelect.body,
          author: commitToSelect.author,
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [taskPath, selectedCommit]);

  useEffect(() => {
    void loadInitialCommits();
  }, [loadInitialCommits]);

  useEffect(() => {
    if (!taskPath || !window.electronAPI.onGitStatusChanged) return;
    return window.electronAPI.onGitStatusChanged((event) => {
      if (event?.taskPath !== taskPath) return;
      void loadInitialCommits();
    });
  }, [taskPath, loadInitialCommits]);

  const loadMore = useCallback(async () => {
    if (!taskPath || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await window.electronAPI.gitGetLog({
        taskPath,
        maxCount: PAGE_SIZE,
        skip: commits.length,
        aheadCount,
      });
      if (res?.success && res.commits && res.commits.length > 0) {
        const newCommits = res.commits;
        setCommits((prev) => [...prev, ...newCommits]);
        setHasMore(newCommits.length >= PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [taskPath, loadingMore, hasMore, commits.length, aheadCount]);

  const handleUndoCommit = useCallback(
    async (commit: Commit, index: number, allowPushed = false) => {
      if (!taskPath || undoingCommitHash) return;
      if (index !== 0) return;

      setUndoingCommitHash(commit.hash);
      try {
        const result = await window.electronAPI.gitSoftReset({
          taskPath,
          allowPushed: allowPushed || undefined,
        });
        if (result?.success) {
          const undoingPushedCommit = allowPushed || commit.isPushed;
          toast({
            title: undoingPushedCommit ? 'Commit undone locally' : 'Commit undone',
            description: undoingPushedCommit
              ? `${result.subject || commit.subject || 'The last commit was undone.'} Force push to update origin.`
              : result.subject || commit.subject || 'The last commit was undone.',
          });
          await loadInitialCommits();
        } else {
          toast({
            title: 'Undo failed',
            description: friendlyGitError(result?.error || 'Unknown error'),
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Undo failed',
          description: friendlyGitError(error instanceof Error ? error.message : String(error)),
          variant: 'destructive',
        });
      } finally {
        setUndoingCommitHash(null);
      }
    },
    [taskPath, toast, undoingCommitHash, loadInitialCommits]
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No commits
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {commits.map((commit, index) => {
        const canUndo = index === 0;
        const isUndoingThisCommit = undoingCommitHash === commit.hash;

        return (
          <ContextMenu key={commit.hash}>
            <ContextMenuTrigger asChild>
              <button
                className={`w-full cursor-pointer border-b border-border/50 px-3 py-2 text-left ${
                  selectedCommit === commit.hash ? 'bg-accent' : 'hover:bg-muted/50'
                }`}
                onClick={() =>
                  onSelectCommit({
                    hash: commit.hash,
                    subject: commit.subject,
                    body: commit.body,
                    author: commit.author,
                  })
                }
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    {commit.subject ? <div className="truncate text-sm">{commit.subject}</div> : null}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <AuthorAvatar author={commit.author} authorEmail={commit.authorEmail} />
                      <span className="truncate">
                        {commit.author} &middot; {formatRelativeDate(commit.date)}
                      </span>
                    </div>
                  </div>
                  {commit.tags.length > 0 &&
                    commit.tags.map((tag) => (
                      <span
                        key={tag}
                        className="flex shrink-0 items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        <Tag className="h-2.5 w-2.5" />
                        {tag}
                      </span>
                    ))}
                  {!commit.isPushed && (
                    <span title="Not yet pushed to remote">
                      <ArrowUp
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        strokeWidth={2.5}
                      />
                    </span>
                  )}
                </div>
              </button>
            </ContextMenuTrigger>
            {canUndo && (
              <ContextMenuContent>
                <ContextMenuItem
                  onSelect={() => {
                    if (commit.isPushed) {
                      setConfirmUndoPushedCommit(commit);
                      return;
                    }
                    void handleUndoCommit(commit, index);
                  }}
                  disabled={isUndoingThisCommit}
                >
                  <span className="inline-flex items-center gap-2">
                    {isUndoingThisCommit ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Undo2 className="h-3.5 w-3.5" />
                    )}
                    Undo commit
                  </span>
                </ContextMenuItem>
              </ContextMenuContent>
            )}
          </ContextMenu>
        );
      })}
      <AlertDialog
        open={!!confirmUndoPushedCommit}
        onOpenChange={(open) => !open && setConfirmUndoPushedCommit(null)}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Undo pushed commit?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the latest commit from your local branch and restages its changes.
              Because that commit is already on origin, you will need to force push afterward to
              update the remote branch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const commit = confirmUndoPushedCommit;
                setConfirmUndoPushedCommit(null);
                if (commit) void handleUndoCommit(commit, 0, true);
              }}
            >
              Undo locally
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {hasMore && (
        <button
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="w-full px-3 py-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
};
