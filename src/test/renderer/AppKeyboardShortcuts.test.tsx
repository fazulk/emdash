import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppKeyboardShortcuts from '../../renderer/components/AppKeyboardShortcuts';

const {
  useKeyboardShortcutsMock,
  toggleLeftSidebarMock,
  toggleRightSidebarMock,
  toggleThemeMock,
  handleNextTaskMock,
  handlePrevTaskMock,
  handleNewTaskMock,
  getActiveTask,
  setActiveTask,
} = vi.hoisted(() => {
  let activeTask: { metadata?: unknown } | null = null;

  return {
    useKeyboardShortcutsMock: vi.fn(),
    toggleLeftSidebarMock: vi.fn(),
    toggleRightSidebarMock: vi.fn(),
    toggleThemeMock: vi.fn(),
    handleNextTaskMock: vi.fn(),
    handlePrevTaskMock: vi.fn(),
    handleNewTaskMock: vi.fn(),
    getActiveTask: () => activeTask,
    setActiveTask: (value: { metadata?: unknown } | null) => {
      activeTask = value;
    },
  };
});

vi.mock('../../renderer/components/ui/sidebar', () => ({
  useSidebar: () => ({ toggle: toggleLeftSidebarMock }),
}));

vi.mock('../../renderer/components/ui/right-sidebar', () => ({
  useRightSidebar: () => ({ toggle: toggleRightSidebarMock }),
}));

vi.mock('../../renderer/hooks/useTheme', () => ({
  useTheme: () => ({ toggleTheme: toggleThemeMock }),
}));

vi.mock('../../renderer/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: useKeyboardShortcutsMock,
}));

vi.mock('../../renderer/contexts/KeyboardSettingsContext', () => ({
  useKeyboardSettings: () => ({ settings: null }),
}));

vi.mock('../../renderer/contexts/TaskManagementContext', () => ({
  useTaskManagementContext: () => ({
    activeTask: getActiveTask(),
    handleNextTask: handleNextTaskMock,
    handlePrevTask: handlePrevTaskMock,
    handleNewTask: handleNewTaskMock,
  }),
}));

function renderShortcuts() {
  render(
    <AppKeyboardShortcuts
      showCommandPalette={false}
      showSettings={false}
      showDiffViewer={false}
      showEditor={false}
      showKanban={false}
      handleToggleCommandPalette={vi.fn()}
      handleOpenSettings={vi.fn()}
      handleCloseCommandPalette={vi.fn()}
      handleCloseSettings={vi.fn()}
      handleCloseDiffViewer={vi.fn()}
      handleCloseEditor={vi.fn()}
      handleCloseKanban={vi.fn()}
      handleToggleKanban={vi.fn()}
      handleToggleEditor={vi.fn()}
      handleOpenInEditor={vi.fn()}
      handleOpenGitPage={vi.fn()}
    />
  );

  expect(useKeyboardShortcutsMock).toHaveBeenCalledTimes(1);
  return useKeyboardShortcutsMock.mock.calls[0][0];
}

describe('AppKeyboardShortcuts', () => {
  beforeEach(() => {
    setActiveTask(null);
    useKeyboardShortcutsMock.mockReset();
    toggleLeftSidebarMock.mockReset();
    toggleRightSidebarMock.mockReset();
    toggleThemeMock.mockReset();
    handleNextTaskMock.mockReset();
    handlePrevTaskMock.mockReset();
    handleNewTaskMock.mockReset();
  });

  afterEach(() => {
    setActiveTask(null);
  });

  it('dispatches a new-agent event when a standard task is active', () => {
    setActiveTask({ metadata: {} });
    const handlers = renderShortcuts();
    const onNewAgentEvent = vi.fn();

    window.addEventListener('emdash:new-agent', onNewAgentEvent);
    handlers.onNewAgent();

    expect(onNewAgentEvent).toHaveBeenCalledTimes(1);
    window.removeEventListener('emdash:new-agent', onNewAgentEvent);
  });

  it('does not dispatch a new-agent event when no task is active', () => {
    const handlers = renderShortcuts();
    const onNewAgentEvent = vi.fn();

    window.addEventListener('emdash:new-agent', onNewAgentEvent);
    handlers.onNewAgent();

    expect(onNewAgentEvent).not.toHaveBeenCalled();
    window.removeEventListener('emdash:new-agent', onNewAgentEvent);
  });

  it('does not dispatch a new-agent event for multi-agent tasks', () => {
    setActiveTask({ metadata: { multiAgent: { enabled: true } } });
    const handlers = renderShortcuts();
    const onNewAgentEvent = vi.fn();

    window.addEventListener('emdash:new-agent', onNewAgentEvent);
    handlers.onNewAgent();

    expect(onNewAgentEvent).not.toHaveBeenCalled();
    window.removeEventListener('emdash:new-agent', onNewAgentEvent);
  });

  it('wires the git-page shortcut handler through to the keyboard hook', () => {
    const handleOpenGitPage = vi.fn();

    render(
      <AppKeyboardShortcuts
        showCommandPalette={false}
        showSettings={false}
        showDiffViewer={false}
        showEditor={false}
        showKanban={false}
        handleToggleCommandPalette={vi.fn()}
        handleOpenSettings={vi.fn()}
        handleCloseCommandPalette={vi.fn()}
        handleCloseSettings={vi.fn()}
        handleCloseDiffViewer={vi.fn()}
        handleCloseEditor={vi.fn()}
        handleCloseKanban={vi.fn()}
        handleToggleKanban={vi.fn()}
        handleToggleEditor={vi.fn()}
        handleOpenInEditor={vi.fn()}
        handleOpenGitPage={handleOpenGitPage}
      />
    );

    const handlers = useKeyboardShortcutsMock.mock.calls[0][0];
    handlers.onOpenGitPage();

    expect(handleOpenGitPage).toHaveBeenCalledTimes(1);
  });
});
