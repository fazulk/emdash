import { execFile, spawn } from 'child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'util';
import { log } from '../lib/logger';
import { stripAnsi } from '@shared/text/stripAnsi';

const execFileAsync = promisify(execFile);
const CODEX_MODEL = 'gpt-5.4-mini';
const MAX_PATCH_CHARS = 12000;

type CommitStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface CommitMessageContext {
  diffStat: string;
  nameStatus: string;
  patch: string;
  taskLabel?: string;
}

type ParsedChange = {
  path: string;
  status: CommitStatus;
};

const STATUS_VERBS: Record<CommitStatus, string> = {
  added: 'Add',
  modified: 'Update',
  deleted: 'Remove',
  renamed: 'Rename',
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function summarizeCounts(changes: ParsedChange[]) {
  const counts: Record<CommitStatus, number> = {
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
  };

  for (const change of changes) {
    counts[change.status] += 1;
  }

  const segments = (Object.entries(counts) as Array<[CommitStatus, number]>)
    .filter(([, count]) => count > 0)
    .sort(([, left], [, right]) => right - left)
    .map(([status, count]) => `${STATUS_VERBS[status]} ${count} ${pluralize(count, 'file')}`);

  if (segments.length === 0) return null;
  if (segments.length === 1) return segments[0];
  if (segments.length === 2) return `${segments[0]} and ${segments[1].toLowerCase()}`;

  const [first, second, ...rest] = segments;
  return `${first}, ${second.toLowerCase()}, and ${rest.length} more ${pluralize(
    rest.length,
    'change'
  )}`;
}

function parseNameStatus(nameStatus: string): ParsedChange[] {
  return nameStatus
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      const rawStatus = parts[0] ?? '';
      const pathValue =
        rawStatus.startsWith('R') || rawStatus.startsWith('C')
          ? (parts[2] ?? parts[1] ?? '').trim()
          : (parts[1] ?? '').trim();

      let status: CommitStatus = 'modified';
      if (rawStatus.startsWith('A')) status = 'added';
      else if (rawStatus.startsWith('D')) status = 'deleted';
      else if (rawStatus.startsWith('R')) status = 'renamed';

      return pathValue ? { path: pathValue, status } : null;
    })
    .filter((change): change is ParsedChange => change !== null);
}

function sanitizeCommitMessage(raw: string): string | null {
  let text = stripAnsi(raw, { stripOscSt: true, stripOtherEscapes: true }).trim();
  if (!text) return null;

  text = text.replace(/```(?:\w+)?/g, '').trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as
        | { message?: string; title?: string; commitMessage?: string }
        | undefined;
      text = parsed?.message || parsed?.commitMessage || parsed?.title || text;
    } catch {
      // Fall back to raw text.
    }
  }

  const firstLine =
    text
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '';
  let candidate = firstLine
    .replace(/^[-*]\s*/, '')
    .replace(/^commit message:\s*/i, '')
    .replace(/^subject:\s*/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();

  candidate = candidate.replace(/\s+/g, ' ').replace(/[.]+$/, '').trim();
  if (!candidate) return null;

  if (candidate.length <= 72) return candidate;

  const truncated = candidate.slice(0, 72);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace >= 48 ? truncated.slice(0, lastSpace) : truncated).trimEnd();
}

export class CommitMessageGenerationService {
  async generateForLocalTask(taskPath: string): Promise<string> {
    const context = await this.getLocalContext(taskPath);
    return this.generateFromContext(context);
  }

  async generateFromContext(context: CommitMessageContext): Promise<string> {
    const fallback = this.generateHeuristicMessage(context);

    if (!context.diffStat && !context.nameStatus && !context.patch) {
      return fallback;
    }

    try {
      const generated = await this.runCodex(this.buildPrompt(context));
      return sanitizeCommitMessage(generated) || fallback;
    } catch (error) {
      log.warn('Failed to generate commit message with Codex', {
        error: error instanceof Error ? error.message : String(error),
      });
      return fallback;
    }
  }

  private async getLocalContext(taskPath: string): Promise<CommitMessageContext> {
    const [diffStatResult, nameStatusResult, patchResult] = await Promise.all([
      execFileAsync('git', ['diff', '--cached', '--stat'], {
        cwd: taskPath,
        maxBuffer: 1024 * 1024,
      }).catch(() => ({ stdout: '' })),
      execFileAsync('git', ['diff', '--cached', '--name-status'], {
        cwd: taskPath,
        maxBuffer: 1024 * 1024,
      }).catch(() => ({ stdout: '' })),
      execFileAsync('git', ['diff', '--cached', '--no-color', '--unified=1'], {
        cwd: taskPath,
        maxBuffer: 4 * 1024 * 1024,
      }).catch(() => ({ stdout: '' })),
    ]);

    return {
      diffStat: diffStatResult.stdout.trim(),
      nameStatus: nameStatusResult.stdout.trim(),
      patch: patchResult.stdout.trim().slice(0, MAX_PATCH_CHARS),
      taskLabel: path.basename(taskPath),
    };
  }

  private async runCodex(prompt: string): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emdash-commit-message-'));
    const outputPath = path.join(tempDir, 'message.txt');

    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          'codex',
          [
            'exec',
            '--model',
            CODEX_MODEL,
            '--sandbox',
            'read-only',
            '--skip-git-repo-check',
            '--color',
            'never',
            '--output-last-message',
            outputPath,
            prompt,
          ],
          {
            cwd: tempDir,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );

        let stderr = '';

        child.stderr?.on('data', (chunk: Buffer | string) => {
          stderr += chunk.toString();
        });

        child.on('error', reject);
        child.on('exit', (code) => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(new Error(stderr.trim() || `codex exited with code ${code ?? 'unknown'}`));
        });
      });

      return await fs.readFile(outputPath, 'utf8');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  private buildPrompt(context: CommitMessageContext): string {
    const statBlock = context.diffStat || '(no diff stat available)';
    const nameStatusBlock = context.nameStatus || '(no file list available)';
    const patchBlock = context.patch || '(no patch excerpt available)';

    return `Write a single Git commit subject line for these staged changes.

Requirements:
- Return only the commit subject.
- No quotes, no markdown, no bullets, no explanation.
- Maximum 72 characters.
- Use imperative mood.
- Be specific to the staged changes shown below.
- Prefer a conventional commit prefix only when it is clearly warranted.

Staged diff stat:
${statBlock}

Staged file status:
${nameStatusBlock}

Staged patch excerpt:
${patchBlock}`;
  }

  private generateHeuristicMessage(context: CommitMessageContext): string {
    const changes = parseNameStatus(context.nameStatus);
    if (changes.length === 1) {
      const [change] = changes;
      return `${STATUS_VERBS[change.status]} ${change.path}`;
    }

    if (changes.length > 1) {
      return summarizeCounts(changes) ?? 'Update files';
    }

    if (context.taskLabel) {
      return `Update ${context.taskLabel}`;
    }

    return 'Update files';
  }
}

export const commitMessageGenerationService = new CommitMessageGenerationService();
