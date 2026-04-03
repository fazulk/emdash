import { describe, expect, it } from 'vitest';
import {
  normalizeCommitSubject,
  type CommitMessageContext,
} from '../../main/services/CommitMessageGenerationService';

function makeContext(nameStatus: string): CommitMessageContext {
  return {
    diffStat: '',
    nameStatus,
    patch: '',
  };
}

describe('normalizeCommitSubject', () => {
  it('preserves existing conventional commit subjects', () => {
    expect(normalizeCommitSubject('feat(auth): Add login redirect')).toBe(
      'feat(auth): add login redirect'
    );
  });

  it('uses a docs prefix when the staged files are documentation', () => {
    expect(normalizeCommitSubject('Update README', makeContext('M\tREADME.md'))).toBe(
      'docs: update README'
    );
  });

  it('uses a test prefix when the staged files are tests', () => {
    expect(
      normalizeCommitSubject(
        'Update flaky coverage assertions',
        makeContext('M\tsrc/test/main/AgentEventService.test.ts')
      )
    ).toBe('test: update flaky coverage assertions');
  });

  it('falls back to chore for freeform subjects without a conventional prefix', () => {
    expect(normalizeCommitSubject('ship it')).toBe('chore: ship it');
  });
});
