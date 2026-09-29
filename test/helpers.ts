import path from 'node:path';

import type { CliIo } from '@/cli/io.ts';
import type { LookupResult } from '@/data/dump.ts';
import { extractUsages } from '@/extract/index.ts';
import type { Target } from '@/targets/index.ts';
import type { ApiRef, Finding, Usage } from '@/types.ts';

export const fixturesDirectory = path.join(import.meta.dirname, 'fixtures');

export function fixture(name: string): string {
  return path.join(fixturesDirectory, name);
}

const defaultGlobals = new Set([
  'process',
  'Buffer',
  'global',
  'globalThis',
  'self',
  'BroadcastChannel',
]);

/** Extracts usages from a snippet as compact `kind display` strings. */
export function usagesOf(source: string, file = 'src/input.ts'): string[] {
  return extractUsages(file, source, { globals: defaultGlobals }).map(
    usage => `${usage.kind} ${usage.display}`,
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
