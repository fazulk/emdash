import { isValidProviderId } from '@shared/providers/registry';
import type { Agent } from '../types';

const DEFAULT_AGENT: Agent = 'claude';

/**
 * Resolve the default agent for the new-task modal.
 *
 * Preference order:
 * 1. The configured default provider, as long as it is enabled.
 *    When agent detection has not finished yet (`visibleAgents` is empty), keep
 *    that preference so the modal can settle on it once availability arrives.
 * 2. The first visible agent.
 * 3. The first enabled agent.
 * 4. Claude as a final fallback.
 */
export function resolveDefaultTaskAgent(
  settingsDefaultProvider: unknown,
  enabledAgents: readonly string[],
  visibleAgents: readonly string[]
): Agent {
  const firstVisibleAgent = visibleAgents[0] as Agent | undefined;
  const firstEnabledAgent = (enabledAgents[0] as Agent | undefined) ?? DEFAULT_AGENT;

  if (
    isValidProviderId(settingsDefaultProvider) &&
    enabledAgents.includes(settingsDefaultProvider)
  ) {
    const settingsAgent = settingsDefaultProvider as Agent;
    if (visibleAgents.length === 0 || visibleAgents.includes(settingsAgent)) {
      return settingsAgent;
    }
  }

  return firstVisibleAgent ?? firstEnabledAgent;
}
