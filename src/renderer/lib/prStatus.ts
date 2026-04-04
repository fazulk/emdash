export type PrInfo = {
  number?: number;
  title?: string;
  url?: string;
  state?: string | null;
  isDraft?: boolean;
};

export type AutoMergeRequest = {
  enabledAt?: string;
  mergeMethod?: string;
};

export type PrReviewer = {
  login: string;
  state?: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
};

export type PrStatus = PrInfo & {
  mergeStateStatus?: string;
  headRefName?: string;
  baseRefName?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  autoMergeRequest?: AutoMergeRequest | null;
  reviewDecision?: string | null;
  reviewers?: PrReviewer[];
};

export const isActivePr = (pr?: PrInfo | null): pr is PrInfo => {
  if (!pr) return false;
  const state = typeof pr?.state === 'string' ? pr.state.toLowerCase() : '';
  if (state === 'merged' || state === 'closed') return false;
  return true;
};
