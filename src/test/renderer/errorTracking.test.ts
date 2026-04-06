// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

describe('renderer errorTracking', () => {
  beforeAll(async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: {
        captureTelemetry: vi.fn(),
      },
      configurable: true,
    });

    await import('../../renderer/lib/errorTracking');
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(window.electronAPI.captureTelemetry).mockClear();
  });

  it('ignores ResizeObserver loop window errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'ResizeObserver loop completed with undelivered notifications.',
        error: new Error('ResizeObserver loop completed with undelivered notifications.'),
      })
    );

    expect(window.electronAPI.captureTelemetry).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      '[ErrorTracking]',
      expect.stringContaining('ResizeObserver')
    );
  });

  it('still reports real unhandled window errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'Boom',
        error: new Error('Boom'),
        filename: 'test.tsx',
        lineno: 12,
        colno: 4,
      })
    );

    expect(window.electronAPI.captureTelemetry).toHaveBeenCalledWith(
      '$exception',
      expect.objectContaining({
        $exception_message: 'Boom',
        $exception_type: 'unhandled_error',
        severity: 'critical',
        component: 'global',
      })
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[ErrorTracking]',
      'Boom',
      expect.objectContaining({
        severity: 'critical',
        component: 'global',
      })
    );
  });
});
