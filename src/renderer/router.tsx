import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { AppProviders, WorkspaceRouteContent } from './AppShell';

const rootRoute = createRootRoute({
  component: AppProviders,
  notFoundComponent: WorkspaceRouteContent,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: WorkspaceRouteContent,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/home',
  component: WorkspaceRouteContent,
});

const skillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/skills',
  component: WorkspaceRouteContent,
});

const mcpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/mcp',
  component: WorkspaceRouteContent,
});

const automationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/automations',
  component: WorkspaceRouteContent,
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  component: WorkspaceRouteContent,
});

const kanbanRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/kanban',
  component: WorkspaceRouteContent,
});

const taskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/tasks/$taskId',
  component: WorkspaceRouteContent,
});

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/tasks/$taskId/editor',
  component: WorkspaceRouteContent,
});

const diffRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/tasks/$taskId/diff',
  component: WorkspaceRouteContent,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  homeRoute,
  skillsRoute,
  mcpRoute,
  automationsRoute,
  projectRoute,
  kanbanRoute,
  taskRoute,
  editorRoute,
  diffRoute,
]);

export const appRouter = createRouter({
  routeTree,
  history: createHashHistory(),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof appRouter;
  }
}
