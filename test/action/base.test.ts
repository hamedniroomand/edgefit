import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { runScript, temporaryDirectory, write } from './scripts.ts';
import type { ScriptRun } from './scripts.ts';

const zeros = '0000000000000000000000000000000000000000';

function git(cwd: string, ...args: string[]): string {
  const identity = ['-c', 'user.name=t', '-c', 'user.email=t@example.com'];
  return execFileSync('git', [...identity, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/** A clone with `main` at `base` and a `feature` branch one commit ahead, the way a pull request is. */
function repository(): { clone: string; base: string; head: string } {
  const root = temporaryDirectory();
  const origin = path.join(root, 'origin.git');
  const clone = path.join(root, 'clone');
  git(root, 'init', '--bare', '--initial-branch=main', origin);
  git(root, 'clone', '--quiet', origin, clone);
  write(path.join(clone, 'a.txt'), 'a');
  git(clone, 'add', '.');
  git(clone, 'commit', '--quiet', '-m', 'base');
  git(clone, 'push', '--quiet', 'origin', 'main');
  const base = git(clone, 'rev-parse', 'HEAD');
  write(path.join(clone, 'b.txt'), 'b');
  git(clone, 'add', '.');
  git(clone, 'commit', '--quiet', '-m', 'head');
  return { clone, base, head: git(clone, 'rev-parse', 'HEAD') };
}

function findBase(clone: string, event: Record<string, string>): ScriptRun & { temp: string } {
  const temp = temporaryDirectory();
  const run = runScript('base.sh', clone, {
    RUNNER_TEMP: temp,
    IDENTITY: 'edgefit@1.0.0',
    CACHE_INPUTS: 'workerd |  | . | ',
    EVENT: 'workflow_dispatch',
    PR_BASE_SHA: '',
    PUSH_BEFORE: '',
    ...event,
  });
  return { ...run, temp };
}

function emptyReport(temp: string): unknown {
  return JSON.parse(readFileSync(path.join(temp, 'edgefit', 'base.json'), 'utf8'));
}

describe('the base commit', () => {
  it('is the merge base of a pull request', () => {
    const { clone, base } = repository();
    const run = findBase(clone, { EVENT: 'pull_request', PR_BASE_SHA: base });
    expect(run.status).toBe(0);
    expect(run.outputs).toMatchObject({ 'has-base': 'true', sha: base });
    expect(run.outputs['cache-key']).toMatch(/^edgefit-base-edgefit@1\.0\.0-[0-9a-f]{16}-/u);
  });

  it('is the commit before a push', () => {
    const { clone, base } = repository();
    const run = findBase(clone, { EVENT: 'push', PUSH_BEFORE: base });
    expect(run.outputs).toMatchObject({ 'has-base': 'true', sha: base });
  });

  it.each([
    ['a push that creates a branch', { EVENT: 'push', PUSH_BEFORE: zeros }],
    ['a manual run', { EVENT: 'workflow_dispatch' }],
    ['a scheduled run', { EVENT: 'schedule' }],
    [
      'a push whose previous commit cannot be fetched',
      { EVENT: 'push', PUSH_BEFORE: 'f'.repeat(40) },
    ],
  ])('does not exist for %s, so the base report is empty', (_name, event) => {
    const { clone } = repository();
    const run = findBase(clone, event);
    expect(run.status).toBe(0);
    expect(run.outputs['has-base']).toBe('false');
    expect(emptyReport(run.temp)).toEqual({ version: 1, targets: [] });
  });

  it('tells a push with no fetchable base apart from one with no base at all', () => {
    const { clone } = repository();
    const missing = findBase(clone, { EVENT: 'push', PUSH_BEFORE: 'f'.repeat(40) });
    expect(missing.log).toContain('could not fetch the commit before this push');
    const manual = findBase(clone, {});
    expect(manual.log).toContain('has no base commit for a workflow_dispatch event');
  });

  it('gives a different cache key to another edgefit or other inputs', () => {
    const { clone, base } = repository();
    const event = { EVENT: 'pull_request', PR_BASE_SHA: base };
    const keys = [
      findBase(clone, event),
      findBase(clone, { ...event, IDENTITY: 'edgefit@1.1.0' }),
      findBase(clone, { ...event, CACHE_INPUTS: 'bun |  | . | ' }),
    ].map(run => run.outputs['cache-key']);
    expect(new Set(keys).size).toBe(3);
  });
});
