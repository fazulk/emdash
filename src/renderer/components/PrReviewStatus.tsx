import { CheckCircle2, XCircle, MessageCircle, Clock, Eye } from 'lucide-react';
import { Badge } from './ui/badge';
import type { PrStatus, PrReviewer } from '../lib/prStatus';

export function ReviewDecisionBadge({ decision }: { decision?: string | null }) {
  switch (decision) {
    case 'APPROVED':
      return (
        <Badge variant="outline">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          Approved
        </Badge>
      );
    case 'CHANGES_REQUESTED':
      return (
        <Badge variant="outline">
          <XCircle className="h-3 w-3 text-red-500" />
          Changes requested
        </Badge>
      );
    case 'REVIEW_REQUIRED':
      return (
        <Badge variant="outline">
          <Eye className="h-3 w-3 text-amber-500" />
          Review required
        </Badge>
      );
    default:
      return null;
  }
}

function ReviewerStateIcon({ state }: { state?: PrReviewer['state'] }) {
  switch (state) {
    case 'APPROVED':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case 'CHANGES_REQUESTED':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'COMMENTED':
      return <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />;
    case 'PENDING':
      return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    case 'DISMISSED':
      return <MessageCircle className="h-3.5 w-3.5 text-muted-foreground/60" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />;
  }
}

function reviewerStateLabel(state?: PrReviewer['state']): string {
  switch (state) {
    case 'APPROVED':
      return 'Approved';
    case 'CHANGES_REQUESTED':
      return 'Changes requested';
    case 'COMMENTED':
      return 'Commented';
    case 'PENDING':
      return 'Pending';
    case 'DISMISSED':
      return 'Dismissed';
    default:
      return 'Pending';
  }
}

const STATE_SORT_ORDER: Record<string, number> = {
  CHANGES_REQUESTED: 0,
  PENDING: 1,
  COMMENTED: 2,
  APPROVED: 3,
  DISMISSED: 4,
};

interface PrReviewStatusProps {
  pr: PrStatus;
}

export function PrReviewStatus({ pr }: PrReviewStatusProps) {
  const { reviewDecision, reviewers } = pr;

  // Don't show anything if there's no review data at all
  if (!reviewDecision && (!reviewers || reviewers.length === 0)) return null;

  const sortedReviewers = [...(reviewers || [])].sort((a, b) => {
    const aOrder = STATE_SORT_ORDER[a.state || ''] ?? 5;
    const bOrder = STATE_SORT_ORDER[b.state || ''] ?? 5;
    return aOrder - bOrder;
  });

  return (
    <div className="min-w-0">

      {sortedReviewers.length > 0 && (
        <div>
          {sortedReviewers.map((reviewer) => (
            <div key={reviewer.login} className="flex items-center gap-2 px-4 py-1">
              <span className="shrink-0">
                <ReviewerStateIcon state={reviewer.state} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {reviewer.login}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {reviewerStateLabel(reviewer.state)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
