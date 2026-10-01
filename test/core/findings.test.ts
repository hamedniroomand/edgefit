import { describe, expect, it } from 'vite-plus/test';

import { collectFindings, collectSupported, defaultLevels, findingKey } from '@/core/findings.ts';
import type { FindingOptions, ModuleUsages } from '@/core/findings.ts';
import type { Location, Runtime, TargetKey, Usage } from '@/types.ts';
import { makeFinding, makeUsage, stubTarget } from '~/helpers.ts';

const target = stubTarget({
  'fs.watch': { status: 'unsupported', note: 'does not exist on the target' },
  'fs.cp': { status: 'mismatch', note: 'differs' },
  fs: { status: 'unsupported', note: 'does not exist on the target' },
});

const options: FindingOptions = { target, levels: defaultLevels, ignore: [] };

function at(file: string, line: number): Location {
  return { file, line, column: 1 };
}

function module(file: string, usages: ModuleUsages['usages'], name?: string): ModuleUsages {
  return {
    file,
    package: name === undefined ? undefined : { name, version: '1.0.0' },
    chain: [file],
    usages,
  };
}

const watch = (file: string, line: number): Usage =>
  makeUsage({ module: 'fs', path: ['watch'] }, { location: at(file, line) });

describe('collecting findings', () => {
  it('groups the same API within a package and keeps the other locations', () => {
    const { findings } = collectFindings(
      [module('a.js', [watch('a.js', 1)], 'pkg'), module('b.js', [watch('b.js', 7)], 'pkg')],
      options,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.location).toEqual(at('a.js', 1));
    expect(findings[0]?.otherLocations).toEqual([at('b.js', 7)]);
  });

  it('keeps the same API in different packages apart', () => {
    const { findings } = collectFindings(
      [module('a.js', [watch('a.js', 1)], 'one'), module('b.js', [watch('b.js', 1)], 'two')],
      options,
    );
    expect(findings.map(finding => finding.package?.name)).toEqual(['one', 'two']);
  });

  it('drops a module finding when a member of it is reported in the same file', () => {
    const { findings } = collectFindings(
      [
        module('a.js', [
          makeUsage({ module: 'fs', path: [] }, { location: at('a.js', 1) }),
          watch('a.js', 2),
        ]),
      ],
      options,
    );
    expect(findings.map(finding => finding.api)).toEqual(['node:fs.watch']);
  });
});

describe('filtering and ordering findings', () => {
  it('applies level overrides and drops findings set to off', () => {
    const levels = { ...defaultLevels, unsupported: 'off' as const, mismatch: 'error' as const };
    const cp = makeUsage({ module: 'fs', path: ['cp'] });
    const { findings } = collectFindings([module('a.js', [watch('a.js', 1), cp])], {
      ...options,
      levels,
    });
    expect(findings.map(finding => `${finding.level} ${finding.api}`)).toEqual([
      'error node:fs.cp',
    ]);
  });

  it('counts ignored findings, matching package and api prefixes', () => {
    const modules = [module('a.js', [watch('a.js', 1)], 'pkg'), module('b.js', [watch('b.js', 1)])];
    const ignoredPackage = collectFindings(modules, {
      ...options,
      ignore: [{ package: 'pkg' }],
    });
    expect(ignoredPackage.ignored).toBe(1);
    expect(ignoredPackage.findings).toHaveLength(1);

    const ignoredOwnCode = collectFindings(modules, {
      ...options,
      ignore: [{ package: '.', api: 'node:fs.*' }],
    });
    expect(ignoredOwnCode.findings.map(finding => finding.package?.name)).toEqual(['pkg']);
  });

  it('sorts errors before warnings, then by package and location', () => {
    const cp = makeUsage({ module: 'fs', path: ['cp'] });
    const { findings } = collectFindings(
      [module('b.js', [cp], 'zeta'), module('a.js', [watch('a.js', 9)], 'beta')],
      options,
    );
    expect(findings.map(finding => finding.level)).toEqual(['error', 'warning']);
  });
});

describe('finding keys', () => {
  it('ignores versions and line numbers', () => {
    const one = makeFinding('node:fs.watch', { package: { name: 'pkg', version: '1.0.0' } });
    const two = makeFinding('node:fs.watch', {
      package: { name: 'pkg', version: '2.0.0' },
      location: at('elsewhere.js', 40),
    });
    expect(findingKey(one)).toBe(findingKey(two));
  });

  it('identifies the project’s own code by file', () => {
    const one = makeFinding('node:fs.watch');
    const two = makeFinding('node:fs.watch', { location: at('src/other.ts', 1) });
    expect(findingKey(one)).not.toBe(findingKey(two));
  });
});

describe('collecting supported APIs', () => {
  it('lists each supported API once per package and skips problems and dynamic usages', () => {
    const readFile = makeUsage({ module: 'fs', path: ['readFile'] });
    const dynamic = makeUsage(undefined, { kind: 'dynamic' });
    const supported = collectSupported(
      [
        module('a.js', [readFile, readFile, watch('a.js', 1), dynamic], 'pkg'),
        module('b.js', [readFile]),
      ],
      target,
    );
    expect(supported).toEqual([
      { api: 'node:fs.readFile', package: { name: 'pkg', version: '1.0.0' } },
      { api: 'node:fs.readFile', package: undefined },
    ]);
  });
});

describe('collecting guarded findings', () => {
  const absent = stubTarget({
    'fs.watch': { status: 'unsupported', note: 'does not exist on the target', absent: true },
    fs: { status: 'unsupported', note: 'does not exist on the target', absent: true },
  });
  const absentOptions: FindingOptions = { ...options, target: absent };
  const guardedWatch = (file: string, line: number): Usage => ({
    ...watch(file, line),
    guarded: true,
  });

  it('sets guarded usages of a missing API apart from the findings', () => {
    const { findings, guarded } = collectFindings(
      [module('a.js', [guardedWatch('a.js', 1)], 'pkg'), module('b.js', [watch('b.js', 2)], 'pkg')],
      absentOptions,
    );
    expect(findings.map(finding => finding.location.file)).toEqual(['b.js']);
    expect(guarded.map(finding => finding.location.file)).toEqual(['a.js']);
    expect(guarded[0]?.guarded).toBe(true);
  });

  it('keeps a guarded usage of an API that exists and throws as a finding', () => {
    const { findings, guarded } = collectFindings(
      [module('a.js', [guardedWatch('a.js', 1)], 'pkg')],
      options,
    );
    expect(findings.map(finding => finding.api)).toEqual(['node:fs.watch']);
    expect(findings[0]?.guarded).toBeUndefined();
    expect(guarded).toEqual([]);
  });

  it('keeps an unguarded module finding when only a member of it is guarded', () => {
    const whole = makeUsage({ module: 'fs', path: [] }, { location: at('a.js', 1) });
    const { findings, guarded } = collectFindings(
      [module('a.js', [whole, guardedWatch('a.js', 2)], 'pkg')],
      absentOptions,
    );
    expect(findings.map(finding => finding.api)).toEqual(['node:fs']);
    expect(guarded.map(finding => finding.api)).toEqual(['node:fs.watch']);
  });

  it('applies ignore rules to guarded findings too', () => {
    const { guarded, ignored } = collectFindings(
      [module('a.js', [guardedWatch('a.js', 1)], 'pkg')],
      { ...absentOptions, ignore: [{ package: 'pkg' }] },
    );
    expect(guarded).toEqual([]);
    expect(ignored).toBe(1);
  });
});

// What each target is, as the real targets declare it.
const runtimesOf: Partial<Record<TargetKey, readonly Runtime[]>> = {
  workerd: ['workerd'],
  bun: ['bun'],
  deno: ['deno'],
  'deno-deploy': ['deno'],
  'netlify-edge': ['deno', 'netlify'],
};

describe('collecting findings behind a runtime check', () => {
  const onDeno: Usage = { ...watch('a.js', 1), runtimes: [{ runtime: 'deno', present: true }] };
  const notDeno: Usage = { ...watch('b.js', 1), runtimes: [{ runtime: 'deno', present: false }] };
  const both: Usage = {
    ...watch('c.js', 1),
    runtimes: [
      { runtime: 'bun', present: false },
      { runtime: 'deno', present: false },
    ],
  };
  const forTarget = (key: TargetKey): FindingOptions => ({
    ...options,
    target: { ...target, info: { ...target.info, key }, runtimes: runtimesOf[key] ?? [] },
  });
  const modules = [module('a.js', [onDeno]), module('b.js', [notDeno]), module('c.js', [both])];

  it('guards what cannot run on the target, even an API that exists and throws', () => {
    const { findings, guarded } = collectFindings(modules, forTarget('workerd'));
    expect(findings.map(finding => finding.location.file)).toEqual(['b.js', 'c.js']);
    expect(guarded.map(finding => finding.location.file)).toEqual(['a.js']);
  });

  it('counts Deno Deploy as Deno', () => {
    for (const key of ['deno', 'deno-deploy'] as const) {
      const { findings, guarded } = collectFindings(modules, forTarget(key));
      expect(findings.map(finding => finding.location.file)).toEqual(['a.js']);
      expect(guarded.map(finding => finding.location.file)).toEqual(['b.js', 'c.js']);
    }
  });

  it('guards code that needs every runtime it names', () => {
    const { findings } = collectFindings(modules, forTarget('bun'));
    expect(findings.map(finding => finding.location.file)).toEqual(['b.js']);
  });
});

describe('collecting findings behind a check for Netlify', () => {
  const on = (file: string, runtime: 'deno' | 'netlify', present: boolean): Usage => ({
    ...watch(file, 1),
    runtimes: [{ runtime, present }],
  });
  const modules = [
    module('deno.js', [on('deno.js', 'deno', true)]),
    module('netlify.js', [on('netlify.js', 'netlify', true)]),
    module('not-netlify.js', [on('not-netlify.js', 'netlify', false)]),
  ];
  const forTarget = (key: TargetKey): FindingOptions => ({
    ...options,
    target: { ...target, info: { ...target.info, key }, runtimes: runtimesOf[key] ?? [] },
  });
  const files = (key: TargetKey, kind: 'findings' | 'guarded'): string[] =>
    collectFindings(modules, forTarget(key))[kind].map(finding => finding.location.file);

  it('counts Netlify Edge as both Deno and Netlify', () => {
    expect(files('netlify-edge', 'findings')).toEqual(['deno.js', 'netlify.js']);
    expect(files('netlify-edge', 'guarded')).toEqual(['not-netlify.js']);
  });

  it('does not count plain Deno or Workers as Netlify', () => {
    expect(files('deno', 'findings')).toEqual(['deno.js', 'not-netlify.js']);
    expect(files('workerd', 'findings')).toEqual(['not-netlify.js']);
  });
});
