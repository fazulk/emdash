import { cn } from '@/lib/utils';

interface Props {
  branch?: string | null;
  worktreeName?: string | null;
  className?: string;
}

export default function TerminalContextFooter({ branch, worktreeName, className }: Props) {
  if (!branch && !worktreeName) return null;

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-3 border-0 border-t border-border/70 bg-muted/40 px-3 py-1 text-[10px] text-muted-foreground dark:bg-background/60',
        className
      )}
    >
      {branch ? (
        <span className="truncate">
          branch <span className="font-mono text-foreground/90">{branch}</span>
        </span>
      ) : null}
      {worktreeName ? (
        <span className="truncate">
          worktree <span className="font-mono text-foreground/90">{worktreeName}</span>
        </span>
      ) : null}
    </div>
  );
}
