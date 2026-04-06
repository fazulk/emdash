import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

type TelemetryEvent =
  // App lifecycle
  | 'app_started'
  | 'app_closed'
  | 'app_window_focused'
  | 'github_connection_triggered'
  | 'github_connected'
  // Project management
  | 'project_add_clicked'
  | 'project_open_clicked'
  | 'project_create_clicked'
  | 'project_clone_clicked'
  | 'project_create_success'
  | 'project_clone_success'
  | 'project_added_success'
  | 'project_deleted'
  | 'project_view_opened'
  // Task management
  | 'task_created'
  | 'task_deleted'
  | 'task_provider_switched'
  | 'task_custom_named'
  | 'task_advanced_options_opened'
  // Terminal (Right Sidebar)
  | 'terminal_entered'
  | 'terminal_command_executed'
  | 'terminal_new_terminal_created'
  | 'terminal_deleted'
  // Changes (Right Sidebar)
  | 'changes_viewed'
  // Plan mode
  | 'plan_mode_enabled'
  | 'plan_mode_disabled'
  // Git & Pull Requests
  | 'pr_created'
  | 'pr_creation_failed'
  | 'pr_viewed'
  // Linear integration
  | 'linear_connected'
  | 'linear_disconnected'
  | 'linear_issues_searched'
  | 'linear_issue_selected'
  // Jira integration
  | 'jira_connected'
  | 'jira_disconnected'
  | 'jira_issues_searched'
  | 'jira_issue_selected'
  // Plain integration
  | 'plain_connected'
  | 'plain_disconnected'
  | 'plain_threads_searched'
  | 'plain_thread_selected'
  // Sentry integration
  | 'sentry_connected'
  | 'sentry_disconnected'
  // Container & Dev Environment
  | 'container_connect_clicked'
  | 'container_connect_success'
  | 'container_connect_failed'
  // ToolBar Section
  | 'toolbar_feedback_clicked'
  | 'toolbar_left_sidebar_clicked'
  | 'toolbar_right_sidebar_clicked'
  | 'toolbar_settings_clicked'
  | 'toolbar_open_in_menu_clicked'
  | 'toolbar_open_in_selected'
  | 'toolbar_kanban_toggled'
  // Browser Preview
  | 'browser_preview_opened'
  | 'browser_preview_closed'
  | 'browser_preview_url_navigated'
  // Settings & Preferences
  | 'settings_tab_viewed'
  | 'theme_changed'
  | 'telemetry_toggled'
  | 'notification_settings_changed'
  | 'default_provider_changed'
  // Skills
  | 'skills_view_opened'
  | 'skill_installed'
  | 'skill_uninstalled'
  | 'skill_created'
  | 'skill_detail_viewed'
  // Remote Server / SSH
  | 'remote_project_modal_opened'
  | 'remote_project_connection_tested'
  | 'remote_project_created'
  | 'ssh_connection_saved'
  | 'ssh_repo_init'
  | 'ssh_repo_clone'
  | 'ssh_connection_deleted'
  | 'ssh_connect_success'
  | 'ssh_connect_failed'
  | 'ssh_disconnected'
  | 'ssh_reconnect_attempted'
  | 'ssh_settings_opened'
  // GitHub issues
  | 'github_issues_searched'
  | 'github_issue_selected'
  // GitLab integration
  | 'gitlab_connected'
  | 'gitlab_disconnected'
  | 'gitlab_issues_searched'
  | 'gitlab_issue_selected'
  // Forgejo integration
  | 'forgejo_connected'
  | 'forgejo_disconnected'
  | 'forgejo_issues_searched'
  | 'forgejo_issue_selected'
  // Task with issue
  | 'task_created_with_issue'
  // Workspace provider
  | 'workspace_provisioning_task_created'
  | 'workspace_provisioning_started'
  | 'workspace_provisioning_success'
  | 'workspace_provisioning_failed'
  | 'workspace_provider_config_saved'
  // Legacy/aggregate events
  | 'feature_used'
  | 'error'
  // Aggregates (privacy-safe)
  | 'task_snapshot'
  // Session summary (duration only)
  | 'app_session'
  // Agent usage (provider-level only)
  | 'agent_run_start'
  | 'agent_run_finish'
  | 'agent_prompt_sent'
  // DB setup (privacy-safe)
  | 'db_setup'
  // Daily active user tracking
  | 'daily_active_user';

interface InitOptions {
  installSource?: string;
}

let enabled = true;
let instanceId: string | undefined;
let userOptOut: boolean | undefined;
let onboardingSeen = false;
let sessionStartMs = Date.now();
let lastActiveDate: string | undefined;

function getInstanceIdPath(): string {
  const dir = app.getPath('userData');
  return join(dir, 'telemetry.json');
}

function loadOrCreateState(): {
  instanceId: string;
  enabledOverride?: boolean;
  onboardingSeen?: boolean;
  lastActiveDate?: string;
} {
  try {
    const file = getInstanceIdPath();
    if (existsSync(file)) {
      const raw = readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.instanceId === 'string' && parsed.instanceId.length > 0) {
        const enabledOverride =
          typeof parsed.enabled === 'boolean' ? (parsed.enabled as boolean) : undefined;
        const onboardingSeen =
          typeof parsed.onboardingSeen === 'boolean' ? (parsed.onboardingSeen as boolean) : false;
        const lastActiveDate =
          typeof parsed.lastActiveDate === 'string' ? (parsed.lastActiveDate as string) : undefined;
        return {
          instanceId: parsed.instanceId as string,
          enabledOverride,
          onboardingSeen,
          lastActiveDate,
        };
      }
    }
  } catch {
    // fall through to create
  }
  const newId = cryptoRandomId();
  try {
    writeFileSync(getInstanceIdPath(), JSON.stringify({ instanceId: newId }, null, 2), 'utf8');
  } catch {
    // ignore
  }
  return { instanceId: newId };
}

function cryptoRandomId(): string {
  try {
    const { randomUUID } = require('crypto');
    return randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function isEnabled(): boolean {
  return false;
}

export async function init(options?: InitOptions) {
  const env = process.env;
  enabled = !['false', '0', 'no'].includes((env.TELEMETRY_ENABLED ?? 'true').toString().toLowerCase());
  void options;

  const state = loadOrCreateState();
  instanceId = state.instanceId;
  sessionStartMs = Date.now();
  userOptOut =
    typeof state.enabledOverride === 'boolean' ? state.enabledOverride === false : undefined;
  onboardingSeen = state.onboardingSeen === true;
  lastActiveDate = state.lastActiveDate;
}

export async function refreshGithubUsername(): Promise<void> {}

export function capture(_event: TelemetryEvent, _properties?: Record<string, any>) {
  return;
}

export function captureException(
  _error: Error | unknown,
  _additionalProperties?: Record<string, any>
) {
  return;
}

export function shutdown() {
  return;
}

export function isTelemetryEnabled(): boolean {
  return isEnabled();
}

export function getTelemetryStatus() {
  return {
    enabled: isEnabled(),
    envDisabled: !enabled,
    userOptOut: userOptOut === true,
    hasKeyAndHost: false,
    onboardingSeen,
  };
}

export function setTelemetryEnabledViaUser(enabledFlag: boolean) {
  userOptOut = !enabledFlag;
  try {
    const file = getInstanceIdPath();
    let state: any = {};
    if (existsSync(file)) {
      try {
        state = JSON.parse(readFileSync(file, 'utf8')) || {};
      } catch {
        state = {};
      }
    }
    state.instanceId = instanceId || state.instanceId || cryptoRandomId();
    state.enabled = enabledFlag;
    state.updatedAt = new Date().toISOString();
    writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

function persistState(state: {
  instanceId: string;
  enabledOverride?: boolean;
  onboardingSeen?: boolean;
  lastActiveDate?: string;
}) {
  try {
    const existing = existsSync(getInstanceIdPath())
      ? JSON.parse(readFileSync(getInstanceIdPath(), 'utf8'))
      : {};
    const merged = {
      ...existing,
      instanceId: state.instanceId,
      enabled:
        typeof state.enabledOverride === 'boolean' ? state.enabledOverride : existing.enabled,
      onboardingSeen:
        typeof state.onboardingSeen === 'boolean' ? state.onboardingSeen : existing.onboardingSeen,
      lastActiveDate:
        typeof state.lastActiveDate === 'string' ? state.lastActiveDate : existing.lastActiveDate,
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(getInstanceIdPath(), JSON.stringify(merged, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

async function checkDailyActiveUser(): Promise<void> {
  if (!instanceId) return;
  const today = new Date().toISOString().split('T')[0];
  if (lastActiveDate === today) return;
  lastActiveDate = today;
  persistState({
    instanceId,
    enabledOverride: userOptOut === undefined ? undefined : !userOptOut,
    onboardingSeen,
    lastActiveDate: today,
  });
}

export async function checkAndReportDailyActiveUser(): Promise<void> {
  return checkDailyActiveUser();
}

export function setOnboardingSeen(flag: boolean) {
  onboardingSeen = Boolean(flag);
  try {
    persistState({
      instanceId: instanceId || cryptoRandomId(),
      onboardingSeen,
      enabledOverride: userOptOut === undefined ? undefined : !userOptOut,
    });
  } catch {
    // ignore
  }
}
