import React from 'react';
import { AgentSelector } from './AgentSelector';
import type { Agent } from '../types';
import { isValidProviderId } from '@shared/providers/registry';
import { useAppSettings } from '@/contexts/AppSettingsProvider';
import { filterDisabledProviders, getFirstEnabledProvider } from '@/lib/agentAvailability';
import { PROVIDER_IDS } from '@shared/providers/registry';

const DEFAULT_AGENT: Agent = 'claude';

const DefaultAgentSettingsCard: React.FC = () => {
  const { settings, updateSettings, isLoading: loading, isSaving: saving } = useAppSettings();

  const enabledAgents = filterDisabledProviders(PROVIDER_IDS, settings);
  const fallbackAgent = getFirstEnabledProvider(enabledAgents, settings) ?? DEFAULT_AGENT;
  const defaultAgent: Agent =
    isValidProviderId(settings?.defaultProvider) && !settings?.disabledProviders?.includes(settings.defaultProvider)
      ? (settings.defaultProvider as Agent)
      : (fallbackAgent as Agent);

  const handleChange = (agent: Agent) => {
    void import('../lib/telemetryClient').then(({ captureTelemetry }) => {
      captureTelemetry('default_agent_changed', { agent });
    });
    updateSettings({ defaultProvider: agent });
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">Default agent</p>
        <p className="text-sm text-muted-foreground">
          The agent that will be selected by default when creating a new task.
        </p>
      </div>
      <div className="w-[183px] flex-shrink-0">
        <AgentSelector
          value={defaultAgent}
          onChange={handleChange}
          disabled={loading || saving}
          disabledAgents={settings?.disabledProviders ?? []}
          className="w-full"
        />
      </div>
    </div>
  );
};

export default DefaultAgentSettingsCard;
