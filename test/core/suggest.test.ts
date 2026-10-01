import { describe, expect, it } from 'vite-plus/test';

import { collectFindings, defaultLevels } from '@/core/findings.ts';
import type { FindingOptions, ModuleUsages } from '@/core/findings.ts';
import type { Usage } from '@/types.ts';
import { makeUsage, stubTarget } from '~/helpers.ts';

const target = stubTarget({
  'fs.watch': { status: 'unsupported', note: 'does not exist on the target' },
});
const options: FindingOptions = { target, levels: defaultLevels, ignore: [] };

function module(file: string, usages: ModuleUsages['usages']): ModuleUsages {
  return { file, package: undefined, chain: [file], usages };
}

const watch = (file: string, line: number): Usage =>
  makeUsage({ module: 'fs', path: ['watch'] }, { location: { file, line, column: 1 } });

const suggestions = {
  packages: {},
  apis: {
    'node:fs.watch': [
      {
        targets: ['workerd' as const],
        kind: 'change' as const,
        text: 'Watch in development only.',
        source: 'https://example.com/watch',
        reviewed: '2026-09-30',
      },
    ],
  },
};
const withSuggestions: FindingOptions = { ...options, suggestions };

describe('suggesting a fix for a finding', () => {
  it('adds the reviewed fix for the API, with its target and source', () => {
    const { findings } = collectFindings([module('a.js', [watch('a.js', 1)])], withSuggestions);
    expect(findings[0]?.suggestion).toEqual({
      kind: 'change',
      text: 'Watch in development only.',
      target: 'workerd',
      source: 'https://example.com/watch',
    });
  });

  it('adds nothing without suggestions, or for an API with no entry', () => {
    const cp = makeUsage({ module: 'fs', path: ['cp'] });
    expect(
      collectFindings([module('a.js', [watch('a.js', 1)])], options).findings[0]?.suggestion,
    ).toBeUndefined();
    expect(
      collectFindings([module('a.js', [cp])], withSuggestions).findings[0]?.suggestion,
    ).toBeUndefined();
  });
});

describe('suggesting a change of setting', () => {
  it('prefers a change of setting the target reports over a reviewed fix', () => {
    const setting = {
      kind: 'setting' as const,
      text: 'Add the flag.',
      source: 'https://example.com/flag',
    };
    const flagged = stubTarget({
      'fs.watch': { status: 'unsupported', note: 'needs a flag', suggestion: setting },
    });
    const { findings } = collectFindings([module('a.js', [watch('a.js', 1)])], {
      ...withSuggestions,
      target: flagged,
    });
    expect(findings[0]?.suggestion).toMatchObject({ kind: 'setting', text: 'Add the flag.' });
  });
});

describe('leaving a finding without a suggested fix', () => {
  it('leaves guarded findings and warnings that something cannot be checked without one', () => {
    const absent = stubTarget({
      'fs.watch': { status: 'unsupported', note: 'is missing', absent: true },
    });
    const guarded = { ...watch('a.js', 1), guarded: true as const };
    const dynamic = makeUsage(
      { module: 'fs', path: ['watch'] },
      { kind: 'dynamic', reason: 'computed' },
    );
    expect(
      collectFindings([module('a.js', [guarded])], { ...withSuggestions, target: absent })
        .guarded[0]?.suggestion,
    ).toBeUndefined();
    const unknown = stubTarget({}, ['fs.watch']);
    expect(
      collectFindings([module('a.js', [dynamic])], { ...withSuggestions, target: unknown })
        .findings[0]?.suggestion,
    ).toBeUndefined();
  });
});
