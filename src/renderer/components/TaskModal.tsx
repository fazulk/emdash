import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Server } from '@/components/icons/lucide';
import { Button, ButtonContentWithSpinner } from './ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import type { BaseModalProps } from '@/contexts/ModalProvider';
import { SlugInput } from './ui/slug-input';
import { Label } from './ui/label';
import { MultiAgentDropdown } from './MultiAgentDropdown';
import { TaskAdvancedSettings } from './TaskAdvancedSettings';
import { useIntegrationStatus } from './hooks/useIntegrationStatus';
import { type Agent } from '../types';
import { type AgentRun } from '../types/chat';
import { agentMeta } from '../providers/meta';
import { type LinearIssueSummary } from '../types/linear';
import { type GitHubIssueSummary } from '../types/github';
import { type JiraIssueSummary } from '../types/jira';
import { type GitLabIssueSummary } from '../types/gitlab';
import { type PlainThreadSummary } from '../types/plain';
import { type ForgejoIssueSummary } from '../types/forgejo';
import {
  generateFriendlyTaskName,
  normalizeTaskName,
  MAX_TASK_NAME_LENGTH,
} from '../lib/taskNames';
import BranchSelect, { pickDefaultBranch } from './BranchSelect';
import { generateTaskNameFromContext } from '../lib/branchNameGenerator';
import type { Project } from '../types/app';
import { useProjectManagementContext } from '../contexts/ProjectManagementProvider';
import { useTaskManagementContext } from '../contexts/TaskManagementContext';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { useAppSettings } from '@/contexts/AppSettingsProvider';
import { filterDisabledProviders, getDisabledProviderIds } from '@/lib/agentAvailability';
import { PROVIDER_IDS } from '@shared/providers/registry';
import { useCliAgentDetection } from '@/hooks/useCliAgentDetection';
import { WorktreeIcon } from './icons/WorktreeIcon';
import { resolveDefaultTaskAgent } from '@/lib/defaultTaskAgent';

const DEFAULT_AGENT: Agent = 'claude';

export interface CreateTaskResult {
  name: string;
  initialPrompt?: string;
  agentRuns?: AgentRun[];
  linkedLinearIssue?: LinearIssueSummary | null;
  linkedGithubIssue?: GitHubIssueSummary | null;
  linkedJiraIssue?: JiraIssueSummary | null;
  linkedPlainThread?: PlainThreadSummary | null;
  linkedGitlabIssue?: GitLabIssueSummary | null;
  linkedForgejoIssue?: ForgejoIssueSummary | null;
  autoApprove?: boolean;
  useWorktree?: boolean;
  baseRef?: string;
  nameGenerated?: boolean;
  /** When true, provision a remote workspace instead of creating a local worktree. */
  useRemoteWorkspace?: boolean;
  /** Workspace provider commands — required when useRemoteWorkspace is true. */
  workspaceProvider?: {
    provisionCommand: string;
    terminateCommand: string;
  };
}

interface TaskModalProps {
  onClose: () => void;
  initialProject?: Project;
  onCreateTask: (
    name: string,
    initialPrompt?: string,
    agentRuns?: AgentRun[],
    linkedLinearIssue?: LinearIssueSummary | null,
    linkedGithubIssue?: GitHubIssueSummary | null,
    linkedJiraIssue?: JiraIssueSummary | null,
    linkedPlainThread?: PlainThreadSummary | null,
    linkedGitlabIssue?: GitLabIssueSummary | null,
    linkedForgejoIssue?: ForgejoIssueSummary | null,
    autoApprove?: boolean,
    useWorktree?: boolean,
    baseRef?: string,
    nameGenerated?: boolean,
    useRemoteWorkspace?: boolean,
    workspaceProvider?: { provisionCommand: string; terminateCommand: string }
  ) => Promise<void>;
}

export type TaskModalOverlayProps = BaseModalProps<CreateTaskResult> & {
  initialProject?: Project;
};

export function TaskModalOverlay({ onClose, initialProject }: TaskModalOverlayProps) {
  const { handleCreateTask } = useTaskManagementContext();

  return (
    <TaskModal
      onClose={onClose}
      initialProject={initialProject}
      onCreateTask={async (
        name,
        initialPrompt,
        agentRuns,
        linkedLinearIssue,
        linkedGithubIssue,
        linkedJiraIssue,
        linkedPlainThread,
        linkedGitlabIssue,
        linkedForgejoIssue,
        autoApprove,
        useWorktree,
        baseRef,
        nameGenerated,
        useRemoteWorkspace,
        workspaceProvider
      ) => {
        await handleCreateTask(
          name,
          initialPrompt,
          agentRuns,
          linkedLinearIssue ?? null,
          linkedGithubIssue ?? null,
          linkedJiraIssue ?? null,
          linkedPlainThread ?? null,
          linkedGitlabIssue ?? null,
          linkedForgejoIssue ?? null,
          autoApprove,
          useWorktree,
          baseRef,
          nameGenerated,
          useRemoteWorkspace,
          workspaceProvider,
          initialProject ?? undefined
        );
      }}
    />
  );
}

const TaskModal: React.FC<TaskModalProps> = ({ onClose, initialProject, onCreateTask }) => {
  const {
    selectedProject,
    projectDefaultBranch: defaultBranch,
    projectBranchOptions: branchOptions,
    isLoadingBranches,
    refreshBranches,
  } = useProjectManagementContext();
  const { linkedGithubIssueMap } = useTaskManagementContext();

  const workspaceProviderEnabled = useFeatureFlag('workspace-provider');
  const { settings: appSettings } = useAppSettings();
  const { cliAgents } = useCliAgentDetection();
  const project = initialProject ?? selectedProject;
  const projectName = project?.name || '';
  const existingNames = (project?.tasks || []).map((w) => w.name);
  const projectPath = project?.path;
  // Form state
  const [taskName, setTaskName] = useState('');
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([{ agent: DEFAULT_AGENT, runs: 1 }]);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Advanced settings state
  const [initialPrompt, setInitialPrompt] = useState('');
  const [selectedLinearIssue, setSelectedLinearIssue] = useState<LinearIssueSummary | null>(null);
  const [selectedGithubIssue, setSelectedGithubIssue] = useState<GitHubIssueSummary | null>(null);
  const [selectedJiraIssue, setSelectedJiraIssue] = useState<JiraIssueSummary | null>(null);
  const [selectedGitlabIssue, setSelectedGitlabIssue] = useState<GitLabIssueSummary | null>(null);
  const [selectedPlainThread, setSelectedPlainThread] = useState<PlainThreadSummary | null>(null);
  const [selectedForgejoIssue, setSelectedForgejoIssue] = useState<ForgejoIssueSummary | null>(
    null
  );
  const [autoApprove, setAutoApprove] = useState(false);
  const [useWorktree, setUseWorktree] = useState(true);
  const [useRemoteWorkspace, setUseRemoteWorkspace] = useState(false);
  const [workspaceProviderConfig, setWorkspaceProviderConfig] = useState<{
    provisionCommand: string;
    terminateCommand: string;
  } | null>(null);
  const hasRemoteWorkspaceOption = workspaceProviderEnabled && !!workspaceProviderConfig;

  // Load workspace provider config from .emdash.json (only when feature flag is on)
  useEffect(() => {
    if (!projectPath || !workspaceProviderEnabled) return;
    void (async () => {
      try {
        const result = await window.electronAPI.getProjectConfig(projectPath);
        if (result.success && result.content) {
          const parsed = JSON.parse(result.content);
          if (
            parsed?.workspaceProvider?.type === 'script' &&
            typeof parsed.workspaceProvider.provisionCommand === 'string' &&
            typeof parsed.workspaceProvider.terminateCommand === 'string'
          ) {
            setWorkspaceProviderConfig({
              provisionCommand: parsed.workspaceProvider.provisionCommand,
              terminateCommand: parsed.workspaceProvider.terminateCommand,
            });
          }
        }
      } catch {
        // Config not found or invalid — no workspace provider available
      }
    })();
  }, [projectPath, workspaceProviderEnabled]);

  // Branch selection state - sync with defaultBranch unless user manually changed it
  const [selectedBranch, setSelectedBranch] = useState(defaultBranch);
  const userChangedBranchRef = useRef(false);
  const taskNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userChangedBranchRef.current) {
      const branch = defaultBranch || pickDefaultBranch(branchOptions);
      if (branch) setSelectedBranch((prev) => (prev === branch ? prev : branch));
    }
  }, [defaultBranch, branchOptions]);

  const handleBranchChange = (value: string) => {
    setSelectedBranch(value);
    userChangedBranchRef.current = true;
  };

  // Auto-name tracking
  const [autoGeneratedName, setAutoGeneratedName] = useState('');
  const [autoGenerateName, setAutoGenerateName] = useState(true);
  const [autoInferTaskNames, setAutoInferTaskNames] = useState(false);
  const userHasTypedRef = useRef(false);
  const autoNameInitializedRef = useRef(false);
  const customNameTrackedRef = useRef(false);
  const didResetOnOpenRef = useRef(false);
  const settingsInitializedRef = useRef(false);
  const agentSelectionIsAutomaticRef = useRef(true);
  // True when the name was derived from context (prompt/issue) — already descriptive
  const nameFromContextRef = useRef(false);

  // Integration connections — always active since component only mounts when open
  const integrations = useIntegrationStatus(true);

  const disabledAgents = useMemo(() => getDisabledProviderIds(appSettings), [appSettings]);
  const enabledAgents = useMemo(
    () => filterDisabledProviders(PROVIDER_IDS, appSettings),
    [appSettings]
  );
  const visibleAgents = useMemo(
    () =>
      cliAgents
        .filter((agent) => agent.status === 'connected' && !disabledAgents.includes(agent.id))
        .map((agent) => agent.id),
    [cliAgents, disabledAgents]
  );

  // Computed values
  const activeAgents = useMemo(() => agentRuns.map((ar) => ar.agent), [agentRuns]);
  const hasAutoApproveSupport = activeAgents.every((id) => !!agentMeta[id]?.autoApproveFlag);
  const hasInitialPromptSupport = activeAgents.every(
    (id) => agentMeta[id]?.initialPromptFlag !== undefined
  );

  const normalizedExisting = useMemo(
    () => existingNames.map((n) => normalizeTaskName(n)).filter(Boolean),
    [existingNames]
  );

  // Validation — empty name is allowed (will auto-generate a random fallback)
  const validate = useCallback(
    (value: string): string | null => {
      const normalized = normalizeTaskName(value);
      if (!normalized) return null; // Empty is OK — will generate a random name
      if (normalizedExisting.includes(normalized)) return 'A Task with this name already exists.';
      if (normalized.length > MAX_TASK_NAME_LENGTH)
        return `Task name is too long (max ${MAX_TASK_NAME_LENGTH} characters).`;
      return null;
    },
    [normalizedExisting]
  );

  // Clear issues when provider doesn't support them
  useEffect(() => {
    if (!hasInitialPromptSupport) {
      setSelectedLinearIssue(null);
      setSelectedGithubIssue(null);
      setSelectedJiraIssue(null);
      setSelectedGitlabIssue(null);
      setSelectedPlainThread(null);
      setSelectedForgejoIssue(null);
      setInitialPrompt('');
    }
  }, [hasInitialPromptSupport]);

  // Clear auto-approve if not supported
  useEffect(() => {
    if (!hasAutoApproveSupport && autoApprove) setAutoApprove(false);
  }, [hasAutoApproveSupport, autoApprove]);

  // Reset form on mount
  useEffect(() => {
    if (didResetOnOpenRef.current) return;
    didResetOnOpenRef.current = true;

    void refreshBranches();
    // Reset state
    setTaskName('');
    setAutoGeneratedName('');
    setError(null);
    setTouched(false);
    setIsFocused(false);
    setInitialPrompt('');
    setSelectedLinearIssue(null);
    setSelectedGithubIssue(null);
    setSelectedJiraIssue(null);
    setSelectedGitlabIssue(null);
    setSelectedPlainThread(null);
    setSelectedForgejoIssue(null);
    setAgentRuns([{ agent: DEFAULT_AGENT, runs: 1 }]);
    setAutoApprove(false);
    setUseWorktree(true);
    userHasTypedRef.current = false;
    autoNameInitializedRef.current = false;
    customNameTrackedRef.current = false;
    settingsInitializedRef.current = false;
    agentSelectionIsAutomaticRef.current = true;
    nameFromContextRef.current = false;
    userChangedBranchRef.current = false;
    setSelectedBranch(defaultBranch);

    // Generate initial name
    const suggested = generateFriendlyTaskName(normalizedExisting);
    setAutoGeneratedName(suggested);
    setTaskName(suggested);
    setError(validate(suggested));
    autoNameInitializedRef.current = true;
  }, [defaultBranch, normalizedExisting, refreshBranches, validate]);

  useEffect(() => {
    if (!appSettings) return;

    const agent = resolveDefaultTaskAgent(
      appSettings.defaultProvider,
      enabledAgents,
      visibleAgents
    );

    if (!settingsInitializedRef.current) {
      settingsInitializedRef.current = true;
      agentSelectionIsAutomaticRef.current = true;
      setAgentRuns([{ agent, runs: 1 }]);

      const autoApproveByDefault = appSettings.tasks?.autoApproveByDefault ?? false;
      setAutoApprove(autoApproveByDefault && !!agentMeta[agent]?.autoApproveFlag);

      const createWorktreeByDefault = appSettings.tasks?.createWorktreeByDefault ?? true;
      setUseWorktree(createWorktreeByDefault);

      const shouldAutoGenerate = appSettings.tasks?.autoGenerateName !== false;
      setAutoGenerateName(shouldAutoGenerate);
      if (!shouldAutoGenerate && !userHasTypedRef.current) {
        setAutoGeneratedName('');
        setTaskName('');
        setError(null);
      }

      setAutoInferTaskNames(appSettings.tasks?.autoInferTaskNames === true);
      return;
    }

    if (!agentSelectionIsAutomaticRef.current) return;

    setAgentRuns((current) => {
      if (current.length !== 1 || current[0]?.agent !== agent) {
        return [{ agent, runs: 1 }];
      }
      return current;
    });
  }, [appSettings, enabledAgents, visibleAgents]);

  useEffect(() => {
    if (!visibleAgents.length) return;

    setAgentRuns((current) => {
      const next = current.filter((run) => visibleAgents.includes(run.agent));
      if (next.length === current.length) return current;
      return [{ agent: visibleAgents[0] as Agent, runs: 1 }];
    });
  }, [visibleAgents]);

  // Auto-generate name from context (prompt / linked issue) with debounce.
  // Only active when both auto-generate and auto-infer settings are enabled.
  useEffect(() => {
    if (!autoGenerateName || !autoInferTaskNames || userHasTypedRef.current) return;

    // Immediate for issue linking, debounced for typed prompts
    const hasIssue = !!(
      selectedLinearIssue ||
      selectedGithubIssue ||
      selectedJiraIssue ||
      selectedPlainThread ||
      selectedGitlabIssue ||
      selectedForgejoIssue
    );
    const delay = hasIssue ? 0 : 400;

    const timer = setTimeout(() => {
      if (userHasTypedRef.current) return;
      const generated = generateTaskNameFromContext({
        initialPrompt: initialPrompt || null,
        linearIssue: selectedLinearIssue,
        githubIssue: selectedGithubIssue,
        jiraIssue: selectedJiraIssue,
        plainThread: selectedPlainThread,
        gitlabIssue: selectedGitlabIssue,
        forgejoIssue: selectedForgejoIssue,
      });
      if (generated) {
        nameFromContextRef.current = true;
        setAutoGeneratedName(generated);
        setTaskName(generated);
        setError(validate(generated));
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [
    autoGenerateName,
    autoInferTaskNames,
    initialPrompt,
    selectedLinearIssue,
    selectedGithubIssue,
    selectedJiraIssue,
    selectedPlainThread,
    selectedGitlabIssue,
    selectedForgejoIssue,
    validate,
  ]);

  const handleNameChange = (val: string) => {
    setTaskName(val);
    setError(validate(val));
    userHasTypedRef.current = true;

    // Track custom naming for telemetry (only once per session)
    if (
      autoGeneratedName &&
      val !== autoGeneratedName &&
      val.trim() &&
      !customNameTrackedRef.current
    ) {
      customNameTrackedRef.current = true;
      void (async () => {
        const { captureTelemetry } = await import('../lib/telemetryClient');
        captureTelemetry('task_custom_named', { custom_name: 'true' });
      })();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);

    const err = validate(taskName);
    if (err) {
      setError(err);
      return;
    }

    // Determine the final task name and whether it should be eligible for
    // post-creation auto-rename (nameGenerated flag).
    // Only mark for post-creation rename when autoInferTaskNames is enabled.
    let finalName = normalizeTaskName(taskName);
    let isNameGenerated = false;
    if (!finalName) {
      // No name at all — use a random fallback; mark for post-creation rename
      finalName = generateFriendlyTaskName(normalizedExisting);
      isNameGenerated = autoGenerateName && autoInferTaskNames;
    } else if (!userHasTypedRef.current && !nameFromContextRef.current) {
      // User never touched the name field AND the name wasn't derived from
      // context (prompt/issue) — it's still a random fallback name.
      // Mark for post-creation rename so the first terminal message can improve it.
      isNameGenerated = autoGenerateName && autoInferTaskNames;
    }
    // When the name was auto-generated from context (prompt/issue),
    // it's already descriptive — don't mark it for post-creation rename.

    setIsCreating(true);

    try {
      await onCreateTask(
        finalName,
        hasInitialPromptSupport && initialPrompt.trim() ? initialPrompt.trim() : undefined,
        agentRuns,
        selectedLinearIssue,
        selectedGithubIssue,
        selectedJiraIssue,
        selectedPlainThread,
        selectedGitlabIssue,
        selectedForgejoIssue,
        hasAutoApproveSupport ? autoApprove : false,
        useRemoteWorkspace ? false : useWorktree,
        selectedBranch,
        isNameGenerated,
        useRemoteWorkspace,
        useRemoteWorkspace && workspaceProviderConfig ? workspaceProviderConfig : undefined
      );
      onClose();
    } catch (error) {
      console.error('Failed to create task:', error);
      setIsCreating(false);
    }
  };

  const handleOpenAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    taskNameInputRef.current?.focus({ preventScroll: true });
  }, []);

  const workspaceMode = useRemoteWorkspace ? 'remote' : useWorktree ? 'worktree' : 'direct';

  const handleWorkspaceModeChange = useCallback(
    (mode: 'worktree' | 'direct' | 'remote') => {
      if (mode === 'remote') {
        setUseRemoteWorkspace(true);
        setUseWorktree(false);
        return;
      }
      setUseRemoteWorkspace(false);
      setUseWorktree(mode === 'worktree');
    },
    [setUseRemoteWorkspace, setUseWorktree]
  );

  return (
    <DialogContent
      className="flex max-h-[calc(100vh-48px)] max-w-md flex-col overflow-hidden p-0"
      onOpenAutoFocus={handleOpenAutoFocus}
      onInteractOutside={(e) => {
        if (isCreating) e.preventDefault();
      }}
      onEscapeKeyDown={(e) => {
        if (isCreating) e.preventDefault();
      }}
    >
      <DialogHeader className="shrink-0 px-6 pr-12 pt-6">
        <DialogTitle>New Task</DialogTitle>
        <DialogDescription className="text-xs">
          Create a task and open the agent workspace.
        </DialogDescription>
        <div className="space-y-1 pt-1">
          <p className="text-sm font-medium text-foreground">{projectName}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">from</span>
            {branchOptions.length > 0 ? (
              <BranchSelect
                value={selectedBranch}
                onValueChange={handleBranchChange}
                options={branchOptions}
                isLoading={isLoadingBranches}
                variant="ghost"
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                {isLoadingBranches ? 'Loading...' : selectedBranch || defaultBranch}
              </span>
            )}
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div>
            <Label htmlFor="task-name" className="mb-2 block">
              Task name (optional)
            </Label>
            <SlugInput
              ref={taskNameInputRef}
              id="task-name"
              value={taskName}
              onChange={handleNameChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                setTouched(true);
                setIsFocused(false);
              }}
              placeholder="refactor-api-routes"
              maxLength={MAX_TASK_NAME_LENGTH}
              className={`w-full ${touched && error && !isFocused ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive' : ''}`}
              aria-invalid={touched && !!error && !isFocused}
            />
          </div>

          <div className="flex items-center gap-4">
            <Label className="shrink-0">Agent</Label>
            <MultiAgentDropdown
              agentRuns={agentRuns}
              onChange={(nextAgentRuns) => {
                agentSelectionIsAutomaticRef.current = false;
                setAgentRuns(nextAgentRuns);
              }}
              disabledAgents={disabledAgents}
              visibleAgents={visibleAgents}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <Label className="shrink-0">Workspace</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={workspaceMode === 'worktree' ? 'secondary' : 'ghost'}
                  className="h-8 gap-1.5 px-2.5 text-xs"
                  onClick={() => handleWorkspaceModeChange('worktree')}
                >
                  <WorktreeIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>Worktree</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={workspaceMode === 'direct' ? 'secondary' : 'ghost'}
                  className="h-8 gap-1.5 px-2.5 text-xs"
                  onClick={() => handleWorkspaceModeChange('direct')}
                >
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                  <span>Direct</span>
                </Button>
                {hasRemoteWorkspaceOption && (
                  <Button
                    type="button"
                    size="sm"
                    variant={workspaceMode === 'remote' ? 'secondary' : 'ghost'}
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    onClick={() => handleWorkspaceModeChange('remote')}
                  >
                    <Server className="h-3.5 w-3.5 shrink-0" />
                    <span>Remote</span>
                  </Button>
                )}
              </div>
            </div>
            {workspaceMode === 'direct' ? (
              <p className="text-xs text-destructive">Direct changes your current branch</p>
            ) : workspaceMode === 'remote' ? (
              <p className="text-xs text-muted-foreground">
                Remote workspace provisioned via script
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Recommended: isolated in a new worktree
              </p>
            )}
          </div>

          <TaskAdvancedSettings
            isOpen={true}
            projectPath={projectPath}
            autoApprove={autoApprove}
            onAutoApproveChange={setAutoApprove}
            hasAutoApproveSupport={hasAutoApproveSupport}
            initialPrompt={initialPrompt}
            onInitialPromptChange={setInitialPrompt}
            hasInitialPromptSupport={hasInitialPromptSupport}
            selectedLinearIssue={selectedLinearIssue}
            onLinearIssueChange={setSelectedLinearIssue}
            isLinearConnected={integrations.isLinearConnected}
            onLinearConnect={integrations.handleLinearConnect}
            selectedGithubIssue={selectedGithubIssue}
            onGithubIssueChange={setSelectedGithubIssue}
            linkedGithubIssueMap={linkedGithubIssueMap}
            isGithubConnected={integrations.isGithubConnected}
            onGithubConnect={integrations.handleGithubConnect}
            githubLoading={integrations.githubLoading}
            githubInstalled={integrations.githubInstalled}
            selectedJiraIssue={selectedJiraIssue}
            onJiraIssueChange={setSelectedJiraIssue}
            isJiraConnected={integrations.isJiraConnected}
            onJiraConnect={integrations.handleJiraConnect}
            selectedGitlabIssue={selectedGitlabIssue}
            onGitlabIssueChange={setSelectedGitlabIssue}
            isGitlabConnected={integrations.isGitlabConnected}
            onGitlabConnect={integrations.handleGitlabConnect}
            selectedPlainThread={selectedPlainThread}
            onPlainThreadChange={setSelectedPlainThread}
            isPlainConnected={integrations.isPlainConnected}
            onPlainConnect={integrations.handlePlainConnect}
            selectedForgejoIssue={selectedForgejoIssue}
            onForgejoIssueChange={setSelectedForgejoIssue}
            isForgejoConnected={integrations.isForgejoConnected}
            onForgejoConnect={integrations.handleForgejoConnect}
          />
        </div>

        <DialogFooter className="shrink-0 px-6 py-4">
          <Button type="submit" disabled={!!error || isCreating} aria-busy={isCreating}>
            <ButtonContentWithSpinner loading={isCreating}>Create</ButtonContentWithSpinner>
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
};

export default TaskModal;
