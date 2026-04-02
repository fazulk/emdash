// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  APP_SHORTCUTS,
  getAgentTabSelectionIndex,
  useKeyboardShortcuts,
} from '../../renderer/hooks/useKeyboardShortcuts';
import type { GlobalShortcutHandlers } from '../../renderer/types/shortcuts';

function ShortcutHarness({ handlers }: { handlers: GlobalShortcutHandlers }) {
  useKeyboardShortcuts(handlers);
  return null;
}

describe('getAgentTabSelectionIndex', () => {
  it('maps Cmd/Ctrl+1 through Cmd/Ctrl+9 to zero-based tab indexes', () => {
    expect(
      getAgentTabSelectionIndex({
        key: '1',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      } as KeyboardEvent)
    ).toBe(0);

    expect(
      getAgentTabSelectionIndex({
        key: '9',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      } as KeyboardEvent)
    ).toBe(8);
  });

  it('accepts Ctrl+number as the Command equivalent on non-mac platforms', () => {
    expect(
      getAgentTabSelectionIndex(
        {
          key: '4',
          metaKey: false,
          ctrlKey: true,
          altKey: false,
          shiftKey: false,
        } as KeyboardEvent,
        false
      )
    ).toBe(3);
  });

  it('ignores keys outside 1-9 and modified variants', () => {
    expect(
      getAgentTabSelectionIndex({
        key: '0',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      } as KeyboardEvent)
    ).toBeNull();

    expect(
      getAgentTabSelectionIndex({
        key: '1',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: true,
      } as KeyboardEvent)
    ).toBeNull();

    expect(
      getAgentTabSelectionIndex({
        key: '1',
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        shiftKey: false,
      } as KeyboardEvent)
    ).toBeNull();

    expect(
      getAgentTabSelectionIndex({
        key: '1',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      } as KeyboardEvent)
    ).toBeNull();
  });
});

describe('new task shortcut defaults', () => {
  it('uses Cmd/Ctrl+T for new task and Cmd/Ctrl+N for new agent', () => {
    expect(APP_SHORTCUTS.NEW_TASK.key).toBe('t');
    expect(APP_SHORTCUTS.NEW_TASK.modifier).toBe('cmd');
    expect(APP_SHORTCUTS.NEW_AGENT.key).toBe('n');
    expect(APP_SHORTCUTS.NEW_AGENT.modifier).toBe('cmd');
  });

  it('triggers the new-task handler on Ctrl+T and not on Ctrl+N', () => {
    const onNewTask = vi.fn();

    render(React.createElement(ShortcutHarness, { handlers: { onNewTask } }));

    fireEvent.keyDown(window, { key: 't', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });

    expect(onNewTask).toHaveBeenCalledTimes(1);
  });
});
