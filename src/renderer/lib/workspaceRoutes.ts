import { generatePath, matchPath } from 'react-router-dom';
import type { SettingsPageTab } from '../types/settings';
import { SETTINGS_PAGE_TABS } from '../types/settings';

export const WORKSPACE_ROUTE_PATHS = {
  root: '/',
  home: '/home',
  skills: '/skills',
  mcp: '/mcp',
  automations: '/automations',
  project: '/projects/:projectId',
  kanban: '/projects/:projectId/kanban',
  task: '/projects/:projectId/tasks/:taskId',
  editor: '/projects/:projectId/tasks/:taskId/editor',
  diff: '/projects/:projectId/tasks/:taskId/diff',
} as const;

export const SETTINGS_TAB_QUERY_KEY = 'settingsTab';
export const DIFF_FILE_QUERY_KEY = 'file';
export const DIFF_TASK_PATH_QUERY_KEY = 'taskPath';

const SETTINGS_TAB_SET = new Set<string>(SETTINGS_PAGE_TABS);

export type WorkspaceRouteKind =
  | 'root'
  | 'home'
  | 'skills'
  | 'mcp'
  | 'automations'
  | 'project'
  | 'kanban'
  | 'task'
  | 'editor'
  | 'diff';

export interface WorkspaceRouteState {
  kind: WorkspaceRouteKind;
  projectId: string | null;
  taskId: string | null;
  settingsTab: SettingsPageTab | null;
  diffFile: string | null;
  diffTaskPath: string | null;
}

interface WorkspaceRouteTarget {
  kind: WorkspaceRouteKind;
  projectId?: string;
  taskId?: string;
}

interface WorkspaceSearchOptions {
  settingsTab?: SettingsPageTab | null;
  diffFile?: string | null;
  diffTaskPath?: string | null;
}

function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '') || '/';
}

function parseSettingsTab(value: string | null): SettingsPageTab | null {
  if (!value || !SETTINGS_TAB_SET.has(value)) return null;
  return value as SettingsPageTab;
}

export function routeSupportsSettingsOverlay(kind: WorkspaceRouteKind): boolean {
  return kind !== 'root' && kind !== 'diff';
}

export function parseWorkspaceRoute(pathname: string, search = ''): WorkspaceRouteState {
  const normalizedPathname = normalizePathname(pathname);
  const params = new URLSearchParams(search);
  const baseState: Pick<WorkspaceRouteState, 'settingsTab' | 'diffFile' | 'diffTaskPath'> = {
    settingsTab: parseSettingsTab(params.get(SETTINGS_TAB_QUERY_KEY)),
    diffFile: null,
    diffTaskPath: null,
  };

  const diffMatch = matchPath(WORKSPACE_ROUTE_PATHS.diff, normalizedPathname);
  if (diffMatch) {
    return {
      kind: 'diff',
      projectId: diffMatch.params.projectId ?? null,
      taskId: diffMatch.params.taskId ?? null,
      settingsTab: null,
      diffFile: params.get(DIFF_FILE_QUERY_KEY),
      diffTaskPath: params.get(DIFF_TASK_PATH_QUERY_KEY),
    };
  }

  const editorMatch = matchPath(WORKSPACE_ROUTE_PATHS.editor, normalizedPathname);
  if (editorMatch) {
    return {
      kind: 'editor',
      projectId: editorMatch.params.projectId ?? null,
      taskId: editorMatch.params.taskId ?? null,
      ...baseState,
    };
  }

  const taskMatch = matchPath(WORKSPACE_ROUTE_PATHS.task, normalizedPathname);
  if (taskMatch) {
    return {
      kind: 'task',
      projectId: taskMatch.params.projectId ?? null,
      taskId: taskMatch.params.taskId ?? null,
      ...baseState,
    };
  }

  const kanbanMatch = matchPath(WORKSPACE_ROUTE_PATHS.kanban, normalizedPathname);
  if (kanbanMatch) {
    return {
      kind: 'kanban',
      projectId: kanbanMatch.params.projectId ?? null,
      taskId: null,
      ...baseState,
    };
  }

  const projectMatch = matchPath(WORKSPACE_ROUTE_PATHS.project, normalizedPathname);
  if (projectMatch) {
    return {
      kind: 'project',
      projectId: projectMatch.params.projectId ?? null,
      taskId: null,
      ...baseState,
    };
  }

  switch (normalizedPathname) {
    case WORKSPACE_ROUTE_PATHS.home:
      return { kind: 'home', projectId: null, taskId: null, ...baseState };
    case WORKSPACE_ROUTE_PATHS.skills:
      return { kind: 'skills', projectId: null, taskId: null, ...baseState };
    case WORKSPACE_ROUTE_PATHS.mcp:
      return { kind: 'mcp', projectId: null, taskId: null, ...baseState };
    case WORKSPACE_ROUTE_PATHS.automations:
      return { kind: 'automations', projectId: null, taskId: null, ...baseState };
    case WORKSPACE_ROUTE_PATHS.root:
      return { kind: 'root', projectId: null, taskId: null, ...baseState };
    default:
      return { kind: 'root', projectId: null, taskId: null, ...baseState };
  }
}

export function buildWorkspacePath(target: WorkspaceRouteTarget): string {
  switch (target.kind) {
    case 'home':
      return WORKSPACE_ROUTE_PATHS.home;
    case 'skills':
      return WORKSPACE_ROUTE_PATHS.skills;
    case 'mcp':
      return WORKSPACE_ROUTE_PATHS.mcp;
    case 'automations':
      return WORKSPACE_ROUTE_PATHS.automations;
    case 'project':
      return generatePath(WORKSPACE_ROUTE_PATHS.project, {
        projectId: target.projectId ?? '',
      });
    case 'kanban':
      return generatePath(WORKSPACE_ROUTE_PATHS.kanban, {
        projectId: target.projectId ?? '',
      });
    case 'task':
      return generatePath(WORKSPACE_ROUTE_PATHS.task, {
        projectId: target.projectId ?? '',
        taskId: target.taskId ?? '',
      });
    case 'editor':
      return generatePath(WORKSPACE_ROUTE_PATHS.editor, {
        projectId: target.projectId ?? '',
        taskId: target.taskId ?? '',
      });
    case 'diff':
      return generatePath(WORKSPACE_ROUTE_PATHS.diff, {
        projectId: target.projectId ?? '',
        taskId: target.taskId ?? '',
      });
    case 'root':
    default:
      return WORKSPACE_ROUTE_PATHS.root;
  }
}

export function buildWorkspaceSearch(options: WorkspaceSearchOptions = {}): string {
  const params = new URLSearchParams();
  if (options.settingsTab) {
    params.set(SETTINGS_TAB_QUERY_KEY, options.settingsTab);
  }
  if (options.diffFile) {
    params.set(DIFF_FILE_QUERY_KEY, options.diffFile);
  }
  if (options.diffTaskPath) {
    params.set(DIFF_TASK_PATH_QUERY_KEY, options.diffTaskPath);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

export function buildWorkspaceHref(
  target: WorkspaceRouteTarget,
  options: WorkspaceSearchOptions = {}
): string {
  return `${buildWorkspacePath(target)}${buildWorkspaceSearch(options)}`;
}

export function updateWorkspaceSearch(
  currentSearch: string,
  next: WorkspaceSearchOptions = {}
): string {
  const params = new URLSearchParams(currentSearch);

  if (next.settingsTab) {
    params.set(SETTINGS_TAB_QUERY_KEY, next.settingsTab);
  } else {
    params.delete(SETTINGS_TAB_QUERY_KEY);
  }

  if (next.diffFile) {
    params.set(DIFF_FILE_QUERY_KEY, next.diffFile);
  } else {
    params.delete(DIFF_FILE_QUERY_KEY);
  }

  if (next.diffTaskPath) {
    params.set(DIFF_TASK_PATH_QUERY_KEY, next.diffTaskPath);
  } else {
    params.delete(DIFF_TASK_PATH_QUERY_KEY);
  }

  const search = params.toString();
  return search ? `?${search}` : '';
}
