import React from 'react';
import { useSidebar } from '../components/ui/sidebar';
import { useRightSidebar } from '../components/ui/right-sidebar';
import { useTheme } from '../hooks/useTheme';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useKeyboardSettings } from '../contexts/KeyboardSettingsContext';
import { useTaskManagementContext } from '../contexts/TaskManagementContext';

export interface AppKeyboardShortcutsProps {
  showCommandPalette: boolean;
  showSettings: boolean;
  showDiffViewer: boolean;
  showEditor: boolean;
  showKanban: boolean;
  handleToggleCommandPalette: () => void;
  handleOpenSettings: () => void;
  handleCloseCommandPalette: () => void;
  handleCloseSettings: () => void;
  handleCloseDiffViewer: () => void;
  handleCloseEditor: () => void;
  handleCloseKanban: () => void;
  handleToggleKanban: () => void;
  handleToggleEditor: () => void;
  handleOpenInEditor: () => void;
  handleOpenGitPage: () => void;
}

const AppKeyboardShortcuts: React.FC<AppKeyboardShortcutsProps> = ({
  showCommandPalette,
  showSettings,
  showDiffViewer,
  showEditor,
  showKanban,
  handleToggleCommandPalette,
  handleOpenSettings,
  handleCloseCommandPalette,
  handleCloseSettings,
  handleCloseDiffViewer,
  handleCloseEditor,
  handleCloseKanban,
  handleToggleKanban,
  handleToggleEditor,
  handleOpenInEditor,
  handleOpenGitPage,
}) => {
  const { toggle: toggleLeftSidebar } = useSidebar();
  const { toggle: toggleRightSidebar } = useRightSidebar();
  const { toggleTheme } = useTheme();
  const { settings: keyboardSettings } = useKeyboardSettings();
  const { activeTask, handleNextTask, handlePrevTask, handleNewTask } = useTaskManagementContext();

  const handleNewAgent = React.useCallback(() => {
    const isMultiAgentTask = Boolean(
      (activeTask?.metadata as { multiAgent?: { enabled?: boolean } } | undefined)?.multiAgent
        ?.enabled
    );
    if (!activeTask || isMultiAgentTask) {
      return;
    }

    window.dispatchEvent(new CustomEvent('emdash:new-agent'));
  }, [activeTask]);

  useKeyboardShortcuts({
    onToggleCommandPalette: handleToggleCommandPalette,
    onOpenSettings: handleOpenSettings,
    onToggleLeftSidebar: toggleLeftSidebar,
    onToggleRightSidebar: toggleRightSidebar,
    onToggleTheme: toggleTheme,
    onToggleKanban: handleToggleKanban,
    onToggleEditor: handleToggleEditor,
    onNextProject: handleNextTask,
    onPrevProject: handlePrevTask,
    onNewTask: handleNewTask,
    onNewAgent: handleNewAgent,
    onNextAgent: () =>
      window.dispatchEvent(
        new CustomEvent('emdash:switch-agent', { detail: { direction: 'next' } })
      ),
    onPrevAgent: () =>
      window.dispatchEvent(
        new CustomEvent('emdash:switch-agent', { detail: { direction: 'prev' } })
      ),
    onSelectAgentTab: (tabIndex) =>
      window.dispatchEvent(new CustomEvent('emdash:select-agent-tab', { detail: { tabIndex } })),
    onOpenInEditor: handleOpenInEditor,
    onOpenGitPage: handleOpenGitPage,
    onCloseModal: (
      [
        [showCommandPalette, handleCloseCommandPalette],
        [showSettings, handleCloseSettings],
        [showDiffViewer, handleCloseDiffViewer],
        [showEditor, handleCloseEditor],
        [showKanban, handleCloseKanban],
      ] as const
    ).find(([open]) => open)?.[1],
    isCommandPaletteOpen: showCommandPalette,
    isSettingsOpen: showSettings,
    isDiffViewerOpen: showDiffViewer,
    isEditorOpen: showEditor,
    isKanbanOpen: showKanban,
    customKeyboardSettings: keyboardSettings ?? undefined,
  });

  return null;
};

export default AppKeyboardShortcuts;
