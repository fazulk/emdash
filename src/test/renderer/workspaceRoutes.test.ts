import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceHref,
  parseWorkspaceRoute,
  routeSupportsSettingsOverlay,
  updateWorkspaceSearch,
} from '../../renderer/lib/workspaceRoutes';

describe('workspaceRoutes', () => {
  it('parses project task routes with settings overlay', () => {
    expect(parseWorkspaceRoute('/projects/p1/tasks/t1', '?settingsTab=account')).toEqual({
      kind: 'task',
      projectId: 'p1',
      taskId: 't1',
      settingsTab: 'account',
      diffFile: null,
      diffTaskPath: null,
    });
  });

  it('parses diff routes and ignores settings overlays there', () => {
    expect(
      parseWorkspaceRoute('/projects/p1/tasks/t1/diff', '?settingsTab=general&file=src/App.tsx')
    ).toEqual({
      kind: 'diff',
      projectId: 'p1',
      taskId: 't1',
      settingsTab: null,
      diffFile: 'src/App.tsx',
      diffTaskPath: null,
    });
  });

  it('builds editor and diff hrefs', () => {
    expect(
      buildWorkspaceHref({
        kind: 'editor',
        projectId: 'p1',
        taskId: 't1',
      })
    ).toBe('/projects/p1/tasks/t1/editor');
    expect(
      buildWorkspaceHref(
        {
          kind: 'diff',
          projectId: 'p1',
          taskId: 't1',
        },
        {
          diffFile: 'src/App.tsx',
          diffTaskPath: '/tmp/task',
        }
      )
    ).toBe('/projects/p1/tasks/t1/diff?file=src%2FApp.tsx&taskPath=%2Ftmp%2Ftask');
  });

  it('updates only route-owned search params', () => {
    expect(updateWorkspaceSearch('?foo=bar&settingsTab=general', { settingsTab: 'account' })).toBe(
      '?foo=bar&settingsTab=account'
    );
    expect(updateWorkspaceSearch('?foo=bar&settingsTab=general', {})).toBe('?foo=bar');
  });

  it('reports which routes can host the settings overlay', () => {
    expect(routeSupportsSettingsOverlay('task')).toBe(true);
    expect(routeSupportsSettingsOverlay('editor')).toBe(true);
    expect(routeSupportsSettingsOverlay('diff')).toBe(false);
  });
});
