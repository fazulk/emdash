import { describe, expect, it } from 'vitest';

import { shouldApplyPtyReplay } from '../../renderer/terminal/replayPolicy';

describe('shouldApplyPtyReplay', () => {
  const replay = { data: 'prompt', cols: 120, rows: 32 };

  it('skips replay for brand-new successful terminals', () => {
    expect(shouldApplyPtyReplay({ ok: true, reused: false, replay })).toBe(false);
  });

  it('applies replay for reused successful terminals', () => {
    expect(shouldApplyPtyReplay({ ok: true, reused: true, replay })).toBe(true);
  });

  it('applies replay for failed starts so persisted output can still be shown', () => {
    expect(shouldApplyPtyReplay({ ok: false, replay })).toBe(true);
  });

  it('skips replay when none is present', () => {
    expect(shouldApplyPtyReplay({ ok: true, reused: true })).toBe(false);
    expect(shouldApplyPtyReplay({ ok: false })).toBe(false);
    expect(shouldApplyPtyReplay(undefined)).toBe(false);
  });
});
