// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { makePtyId } from '../../shared/ptyId';

const {
  getConversationsMock,
  setActiveConversationMock,
  updateConversationTitleMock,
  getOrCreateDefaultConversationMock,
  saveTaskMock,
} = vi.hoisted(() => ({
  getConversationsMock: vi.fn(),
  setActiveConversationMock: vi.fn(),
  updateConversationTitleMock: vi.fn(),
  getOrCreateDefaultConversationMock: vi.fn(),
  saveTaskMock: vi.fn(),
}));

vi.mock('../../renderer/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('../../renderer/hooks/useTheme', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

vi.mock('../../renderer/components/TerminalPane', () => ({
  TerminalPane: React.forwardRef((props: any, ref: React.Ref<any>) => {
    React.useImperativeHandle(ref, () => ({
      focus: vi.fn(),
      clearSearchDecorations: vi.fn(),
      searchNext: vi.fn(),
      searchPrevious: vi.fn(),
      searchAll: vi.fn().mockReturnValue([]),
    }));

    return (
      <div
        data-testid="terminal-pane"
        data-id={props.id}
        data-provider={props.providerId}
        data-cwd={props.cwd}
      />
    );
  }),
}));

vi.mock('../../renderer/components/InstallBanner', () => ({
  default: () => null,
}));

vi.mock('../../renderer/components/AgentLogo', () => ({
  default: () => <div data-testid="agent-logo" />,
}));

vi.mock('../../renderer/components/TaskStatusIndicator', () => ({
  TaskStatusIndicator: () => <div data-testid="task-status-indicator" />,
}));

vi.mock('../../renderer/components/TaskContextBadges', () => ({
  default: () => null,
}));

vi.mock('../../renderer/components/CreateChatModal', () => ({
  CreateChatModal: () => null,
}));

vi.mock('../../renderer/components/TerminalSearchOverlay', () => ({
  TerminalSearchOverlay: () => null,
}));

vi.mock('../../renderer/components/TerminalContextFooter', () => ({
  default: () => null,
}));

vi.mock('../../renderer/components/TaskScopeContext', () => ({
  TaskScopeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../renderer/hooks/useConversationStatus', () => ({
  useConversationStatus: () => 'idle',
}));

vi.mock('../../renderer/hooks/useStatusUnread', () => ({
  useStatusUnread: () => false,
}));

vi.mock('../../renderer/hooks/useInitialPromptInjection', () => ({
  useInitialPromptInjection: () => {},
}));

vi.mock('../../renderer/hooks/useCommentInjection', () => ({
  useCommentInjection: () => {},
}));

vi.mock('@/lib/taskTerminalsStore', () => ({
  useTaskTerminals: () => ({ activeTerminalId: null }),
}));

vi.mock('@/hooks/useAutoScrollOnTaskSwitch', () => ({
  useAutoScrollOnTaskSwitch: () => ({ scrollToBottom: vi.fn() }),
}));

vi.mock('@/hooks/useTerminalViewportWheelForwarding', () => ({
  useTerminalViewportWheelForwarding: () => vi.fn(),
}));

vi.mock('../../renderer/hooks/useWorkspaceConnection', () => ({
  useWorkspaceConnection: () => ({ connectionId: null, remotePath: null }),
}));

vi.mock('../../renderer/hooks/useTerminalSearch', () => ({
  useTerminalSearch: () => ({
    isSearchOpen: false,
    searchQuery: '',
    searchStatus: null,
    searchInputRef: { current: null },
    closeSearch: vi.fn(),
    handleSearchQueryChange: vi.fn(),
    stepSearch: vi.fn(),
  }),
}));

vi.mock('../../renderer/hooks/useFooterBranch', () => ({
  useFooterBranch: ({ fallbackBranch }: { fallbackBranch: string }) => fallbackBranch,
}));

vi.mock('@/contexts/AppSettingsProvider', () => ({
  useAppSettings: () => ({
    settings: {
      tasks: {
        autoApproveByDefault: false,
        autoInferTaskNames: false,
      },
    },
    isLoading: false,
    isSaving: false,
    updateSettings: vi.fn(),
  }),
}));

vi.mock('../../renderer/lib/agentStatusStore', () => ({
  agentStatusStore: {
    markSeen: vi.fn(),
    setActiveView: vi.fn(),
  },
}));

vi.mock('../../renderer/lib/activityStore', () => ({
  activityStore: {
    subscribe: () => () => {},
  },
}));

vi.mock('../../renderer/lib/rpc', () => ({
  rpc: {
    db: {
      getConversations: getConversationsMock,
      setActiveConversation: setActiveConversationMock,
      updateConversationTitle: updateConversationTitleMock,
      getOrCreateDefaultConversation: getOrCreateDefaultConversationMock,
      saveTask: saveTaskMock,
      createConversation: vi.fn(),
      deleteConversation: vi.fn(),
      updateConversation: vi.fn(),
    },
  },
}));

vi.mock('@shared/providers/registry', () => ({
  getInstallCommandForProvider: () => null,
}));

vi.mock('../../renderer/terminal/SessionRegistry', () => ({
  terminalSessionRegistry: {
    getSession: () => null,
    dispose: vi.fn(),
  },
}));

vi.mock('@shared/task/envVars', () => ({
  getTaskEnvVars: () => ({}),
}));

vi.mock('../../renderer/providers/meta', () => ({
  agentMeta: {
    claude: { label: 'Claude', terminalOnly: true, autoApproveFlag: false },
    codex: { label: 'Codex', terminalOnly: true, autoApproveFlag: false },
  },
}));

vi.mock('../../renderer/lib/agentConfig', () => ({
  agentConfig: {
    claude: { name: 'Claude', logo: '<svg></svg>', alt: 'Claude', isSvg: true },
    codex: { name: 'Codex', logo: '<svg></svg>', alt: 'Codex', isSvg: true },
  },
}));

vi.mock('@shared/reviewPreset', () => ({
  getReviewConversationMetadata: () => null,
  parseConversationMetadata: () => null,
}));

vi.mock('../../renderer/lib/terminalFooter', () => ({
  getTerminalFooterSummary: () => ({ branch: 'main', worktreeName: null }),
}));

vi.mock('../../renderer/lib/telemetryClient', () => ({
  captureTelemetry: vi.fn(),
}));

import ChatInterface from '../../renderer/components/ChatInterface';

describe('ChatInterface refresh tab restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    Object.defineProperty(window, 'electronAPI', {
      value: {
        getProviderStatuses: vi.fn().mockResolvedValue({
          success: true,
          statuses: {
            claude: { installed: true },
            codex: { installed: true },
          },
        }),
        onProviderStatusUpdated: vi.fn(() => () => {}),
        onPtyStarted: vi.fn(() => () => {}),
        openExternal: vi.fn(),
        ptyInput: vi.fn(),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores a refreshed secondary chat and immediately switches back to the main agent tab', async () => {
    getConversationsMock.mockResolvedValue([
      {
        id: 'conv-main',
        taskId: 'task-1',
        title: 'Claude',
        provider: undefined,
        isMain: true,
        isActive: false,
        createdAt: '2026-04-03T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
      },
      {
        id: 'conv-codex',
        taskId: 'task-1',
        title: 'Codex',
        provider: 'codex',
        isMain: false,
        isActive: true,
        createdAt: '2026-04-03T00:01:00.000Z',
        updatedAt: '2026-04-03T00:01:00.000Z',
      },
    ]);

    setActiveConversationMock.mockImplementation(() => new Promise(() => {}));

    render(
      <ChatInterface
        task={{
          id: 'task-1',
          projectId: 'project-1',
          name: 'Refresh bug',
          branch: 'main',
          path: '/tmp/task-1',
          status: 'active',
          useWorktree: true,
          agentId: 'claude',
          metadata: null,
        } as any}
        project={null}
        projectName="Project"
        projectPath="/tmp/project"
        initialAgent="claude"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('terminal-pane')).toHaveAttribute(
        'data-id',
        makePtyId('codex', 'chat', 'conv-codex')
      );
      expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-provider', 'codex');
    });

    fireEvent.click(screen.getByText('Claude'));

    await waitFor(() => {
      expect(screen.getByTestId('terminal-pane')).toHaveAttribute(
        'data-id',
        makePtyId('claude', 'main', 'task-1')
      );
      expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-provider', 'claude');
    });

    expect(setActiveConversationMock).toHaveBeenCalledWith({
      taskId: 'task-1',
      conversationId: 'conv-main',
    });
  });
});
