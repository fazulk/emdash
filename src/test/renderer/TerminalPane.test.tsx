// @vitest-environment jsdom

import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const attachMock = vi.fn();
const detachMock = vi.fn();
const disposeMock = vi.fn();

vi.mock('../../renderer/terminal/SessionRegistry', () => ({
  terminalSessionRegistry: {
    attach: (...args: unknown[]) => attachMock(...args),
    detach: (...args: unknown[]) => detachMock(...args),
    dispose: (...args: unknown[]) => disposeMock(...args),
  },
}));

import { TerminalPane } from '../../renderer/components/TerminalPane';

function createSession() {
  return {
    setTheme: vi.fn(),
    focus: vi.fn(),
    forwardWheelInput: vi.fn(() => false),
    scrollViewportFromWheelDelta: vi.fn(() => false),
    restart: vi.fn().mockResolvedValue(true),
    registerActivityListener: vi.fn(() => () => {}),
    registerReadyListener: vi.fn(() => () => {}),
    registerErrorListener: vi.fn(() => () => {}),
    registerExitListener: vi.fn(() => () => {}),
  };
}

describe('TerminalPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attachMock.mockImplementation(() => createSession());
  });

  it('detaches keep-alive terminals on unmount', () => {
    const view = render(<TerminalPane id="task-keepalive" keepAlive />);

    view.unmount();

    expect(detachMock).toHaveBeenCalledTimes(1);
    expect(detachMock).toHaveBeenCalledWith('task-keepalive');
    expect(disposeMock).not.toHaveBeenCalled();
  });

  it('disposes non-persistent terminals on unmount', () => {
    const view = render(<TerminalPane id="task-ephemeral" keepAlive={false} />);

    view.unmount();

    expect(disposeMock).toHaveBeenCalledTimes(1);
    expect(disposeMock).toHaveBeenCalledWith('task-ephemeral');
    expect(detachMock).not.toHaveBeenCalled();
  });
});
