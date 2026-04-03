import { describe, expect, it } from 'vitest';
import { resolveDefaultTaskAgent } from '@/lib/defaultTaskAgent';

describe('resolveDefaultTaskAgent', () => {
  it('prefers the configured default agent when it is visible', () => {
    expect(resolveDefaultTaskAgent('cursor', ['claude', 'cursor'], ['claude', 'cursor'])).toBe(
      'cursor'
    );
  });

  it('keeps the configured default agent while visibility is still unknown', () => {
    expect(resolveDefaultTaskAgent('cursor', ['claude', 'cursor'], [])).toBe('cursor');
  });

  it('falls back to the first visible agent when the configured default is not visible', () => {
    expect(resolveDefaultTaskAgent('cursor', ['claude', 'cursor'], ['claude'])).toBe('claude');
  });

  it('falls back to the first enabled agent when the configured default is invalid', () => {
    expect(resolveDefaultTaskAgent('not-a-provider', ['codex', 'claude'], [])).toBe('codex');
  });
});
