import { makePtyId } from '@shared/ptyId';
import { PROVIDER_IDS, type ProviderId } from '@shared/providers/registry';

type MultiAgentVariantRef = {
  agent: string;
  worktreeId: string;
  path?: string | null;
};

function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Canonical key used for per-variant status subscriptions.
 * Worktree id is stable and also used as PTY suffix.
 */
export function getMultiAgentVariantKey(variant: MultiAgentVariantRef): string {
  return (variant.worktreeId || variant.path || '').trim();
}

/**
 * Canonical main PTY id for multi-agent variants.
 * Falls back to legacy `<worktreeId>-main` only if the agent id is invalid.
 */
export function getMultiAgentMainPtyId(variant: MultiAgentVariantRef): string {
  const key = getMultiAgentVariantKey(variant);
  if (!key) return '';

  if (isProviderId(variant.agent)) {
    return makePtyId(variant.agent, 'main', key);
  }

  return `${key}-main`;
}
