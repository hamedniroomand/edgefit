import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import type { CliIo } from '@/cli/io.ts';
import type { LookupResult } from '@/data/dump.ts';
import { EdgefitError } from '@/errors.ts';
import { extractUsages } from '@/extract/index.ts';
import type { Target } from '@/targets/index.ts';
import type { ApiRef, Finding, Usage } from '@/types.ts';

export const fixturesDirectory = path.join(import.meta.dirname, 'fixtures');

export function fixture(name: string): string {
  return path.join(fixturesDirectory, name);
}

/** Apps with real installed packages: see `apps/README.md`. */
export function sampleApp(name: string): string {
  return path.join(import.meta.dirname, '../apps', name);
}

/**
 * Whether the sample apps' packages are installed: `vp install` in `apps/`. CI always installs
 * them, so a missing install there is an error. A local run without them skips.
 */
export function sampleAppsInstalled(): boolean {
  const installed = existsSync(path.join(sampleApp('known-bad'), 'node_modules'));
  if (!installed && process.env.CI !== undefined) {
    throw new Error('The sample apps are not installed. Run: vp install (in apps/)');
  }
  return installed;
}

const defaultGlobals = new Set([
  'process',
  'Buffer',
  'global',
  'globalThis',
  'self',
  'BroadcastChannel',
]);

function runtimeTags(usage: Usage): string {
  return (usage.runtimes ?? [])
    .map(({ runtime, present }) => ` [${present ? '' : 'not '}${runtime}]`)
    .join('');
}

/** Extracts usages from a snippet as compact `kind display` strings. */
export function usagesOf(
  source: string,
  file = 'src/input.ts',
  globals: ReadonlySet<string> = defaultGlobals,
  options: { lazyNodeImports?: boolean; nodeEnv?: string } = {},
): string[] {
  return extractUsages(file, source, { globals, ...options }).map(
    usage =>
      `${usage.kind} ${usage.display}${usage.guarded === true ? ' [guarded]' : ''}${runtimeTags(usage)}`,
  );
}

export interface CapturedIo extends CliIo {
  output: () => string;
  errors: () => string;
}

export function captureIo(cwd: string): CapturedIo {
  let output = '';
  let errors = '';
  return {
    cwd,
    color: false,
    stdout: text => {
      output += text;
    },
    stderr: text => {
      errors += text;
    },
    output: () => output,
    errors: () => errors,
  };
}

export function makeFinding(api: string, parts: Partial<Finding> = {}): Finding {
  return {
    category: 'unsupported',
    level: 'error',
    api,
    target: 'workerd',
    message: `${api} is unsupported`,
    detail: 'is unsupported',
    package: undefined,
    location: { file: 'src/index.ts', line: 1, column: 1 },
    otherLocations: [],
    chain: ['src/index.ts'],
    ...parts,
  };
}

/** A target whose lookups come from `results`, keyed by `module.path` (`fs.watch`). */
export function stubTarget(
  results: Record<string, LookupResult> = {},
  problemsBelow: readonly string[] = [],
): Target {
  const keyOf = (api: ApiRef): string => [api.module, ...api.path].join('.');
  return {
    info: {
      key: 'workerd',
      platform: 'stub',
      conditions: [],
      data: 'stub',
      settings: 'stub',
      notes: [],
    },
    runtimes: ['workerd'],
    resolvePlatform: 'node',
    defaultEntry: undefined,
    globals: new Set(),
    lookup: api => results[keyOf(api)] ?? { status: 'supported' },
    hasProblemsBelow: api => problemsBelow.includes(keyOf(api)),
  };
}

export function makeUsage(api: ApiRef | undefined, parts: Partial<Usage> = {}): Usage {
  return {
    kind: 'api',
    api,
    display: api === undefined ? 'dynamic' : `node:${[api.module, ...api.path].join('.')}`,
    location: { file: 'src/index.ts', line: 1, column: 1 },
    ...parts,
  };
}

/** The user error a run fails with, for asserting on its message and hint. */
export async function edgefitError(run: Promise<unknown>): Promise<EdgefitError> {
  try {
    await run;
  } catch (error) {
    if (error instanceof EdgefitError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected the run to fail with an EdgefitError');
}
