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
const FALLBACK_CONVENTIONAL_TYPE = 'chore';

type ConventionalCommitType =
  | 'build'
  | 'chore'
  | 'ci'
  | 'docs'
  | 'feat'
  | 'fix'
  | 'perf'
  | 'refactor'
  | 'style'
  | 'test';

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

const CONVENTIONAL_SUBJECT_RE =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|style|test)(\([^)]+\))?(!)?:\s+(.+)$/i;

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

function truncateSubjectLine(line: string): string {
  if (line.length <= 72) return line;

  const truncated = line.slice(0, 72);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace >= 48 ? truncated.slice(0, lastSpace) : truncated).trimEnd();
}

function normalizeDescriptionText(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').replace(/[.]+$/, '').trim();
  if (!collapsed) return 'update files';
  if (/^[A-Z][a-z]/.test(collapsed)) {
    return collapsed[0].toLowerCase() + collapsed.slice(1);
  }
  return collapsed;
}

function looksLikeDocPath(filePath: string): boolean {
  return /(^|\/)(readme|changelog|contributing|license)(\.[^/]+)?$/i.test(filePath) || /\.(md|mdx|rst|txt)$/i.test(filePath);
}

function looksLikeTestPath(filePath: string): boolean {
  return /(^|\/)(test|tests|__tests__|spec|specs)(\/|$)/i.test(filePath) || /\.(test|spec)\.[^.]+$/i.test(filePath);
}

function looksLikeCiPath(filePath: string): boolean {
  return filePath.startsWith('.github/workflows/') || filePath.startsWith('.circleci/') || filePath.startsWith('.buildkite/');
}

function looksLikeBuildPath(filePath: string): boolean {
  return /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|Cargo\.toml|Cargo\.lock|Makefile|Dockerfile)$/i.test(filePath);
}

function inferTypeFromMessage(message: string): ConventionalCommitType | null {
  const lower = message.toLowerCase();
  if (/^(fix|resolve|correct|prevent|handle)\b/.test(lower)) return 'fix';
  if (/^(add|create|implement|introduce|enable|allow|support)\b/.test(lower)) return 'feat';
  if (/^(refactor|rename|restructure|extract|simplify|cleanup|clean up|move)\b/.test(lower))
    return 'refactor';
  if (/^(optimi[sz]e|improve performance|speed up|reduce latency)\b/.test(lower)) return 'perf';
  if (/^(docs?|document)\b/.test(lower) || /\b(readme|changelog|documentation)\b/.test(lower))
    return 'docs';
  if (/^(test|tests|spec)\b/.test(lower) || /\b(test|spec|coverage)\b/.test(lower)) return 'test';
  if (/^(format|lint|style)\b/.test(lower)) return 'style';
  if (/^(build|release|bump|deps?|dependency)\b/.test(lower)) return 'build';
  if (/^(ci|workflow)\b/.test(lower)) return 'ci';
  return null;
}

function inferTypeFromContext(context?: CommitMessageContext): ConventionalCommitType | null {
  if (!context?.nameStatus) return null;

  const changes = parseNameStatus(context.nameStatus);
  if (changes.length === 0) return null;
  const paths = changes.map((change) => change.path);

  if (paths.every(looksLikeDocPath)) return 'docs';
  if (paths.every(looksLikeTestPath)) return 'test';
  if (paths.every(looksLikeCiPath)) return 'ci';
  if (paths.every(looksLikeBuildPath)) return 'build';
  if (changes.every((change) => change.status === 'renamed')) return 'refactor';
  if (changes.every((change) => change.status === 'added')) return 'feat';
  return null;
}

export function normalizeCommitSubject(
  raw: string,
  context?: CommitMessageContext
): string {
  const candidate = sanitizeCommitMessage(raw) ?? '';

  if (!candidate) {
    return `${FALLBACK_CONVENTIONAL_TYPE}: update files`;
  }

  const conventionalMatch = candidate.match(CONVENTIONAL_SUBJECT_RE);
  if (conventionalMatch) {
    const [, type, scope = '', breaking = '', description] = conventionalMatch;
    return truncateSubjectLine(
      `${type.toLowerCase()}${scope}${breaking}: ${normalizeDescriptionText(description)}`
    );
  }

  const type =
    inferTypeFromMessage(candidate) ?? inferTypeFromContext(context) ?? FALLBACK_CONVENTIONAL_TYPE;

  return truncateSubjectLine(`${type}: ${normalizeDescriptionText(candidate)}`);
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
      return normalizeCommitSubject(generated, context);
    } catch (error) {
      log.warn('Failed to generate commit message with Codex', {
        error: error instanceof Error ? error.message : String(error),
      });
      return fallback;
    }
  }

  normalizeSubject(raw: string, context?: CommitMessageContext): string {
    return normalizeCommitSubject(raw, context);
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
- Always use conventional commit format: <type>: <subject>.

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
      return normalizeCommitSubject(`${STATUS_VERBS[change.status]} ${change.path}`, context);
    }

    if (changes.length > 1) {
      return normalizeCommitSubject(summarizeCounts(changes) ?? 'Update files', context);
    }

    if (context.taskLabel) {
      return normalizeCommitSubject(`Update ${context.taskLabel}`, context);
    }

    return normalizeCommitSubject('Update files', context);
  }
}

export const commitMessageGenerationService = new CommitMessageGenerationService();
