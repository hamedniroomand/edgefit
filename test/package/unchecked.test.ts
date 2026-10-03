import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { checkPackage } from '@/package/check-package.ts';
import { summaryOf } from '@/package/result.ts';
import { neededMessage, undeclaredModules } from '@/package/unchecked.ts';
import { ResolveError } from '@/resolve/errors.ts';
import { fixture } from '~/helpers.ts';

const root = mkdtempSync(path.join(tmpdir(), 'edgefit-unchecked-'));
mkdirSync(path.join(root, 'node_modules/pkg'), { recursive: true });
writeFileSync(
  path.join(root, 'node_modules/pkg/package.json'),
  JSON.stringify({
    name: 'pkg',
    dependencies: { dep: '1' },
    peerDependencies: { peer: '1' },
    optionalDependencies: { optional: '1' },
  }),
);

const failure = (...specifiers: string[]): ResolveError =>
  new ResolveError(
    'failed',
    undefined,
    specifiers.map(specifier => ({
      text: `Could not resolve "${specifier}"`,
      location: { file: 'node_modules/pkg/index.js' },
    })) as never,
  );

describe('undeclaredModules', () => {
  it('names a module that the package does not declare', () => {
    expect(undeclaredModules(failure('react'), root)).toEqual(['react']);
    expect(undeclaredModules(failure('react/jsx-runtime', 'next/navigation'), root)).toEqual([
      'react',
      'next',
    ]);
  });

  it.each(['dep', 'peer', 'optional', 'pkg', 'dep/sub', './missing', 'node:fs', 'fs'])(
    'names nothing for %s',
    specifier => {
      expect(undeclaredModules(failure(specifier), root)).toEqual([]);
    },
  );

  it('names nothing when one failure is declared or is not a resolve failure', () => {
    expect(undeclaredModules(failure('react', 'dep'), root)).toEqual([]);
    expect(undeclaredModules(new Error('boom'), root)).toEqual([]);
    expect(undeclaredModules(new ResolveError('failed'), root)).toEqual([]);
    const other = new ResolveError('failed', undefined, [
      { text: 'Syntax error', location: null },
    ] as never);
    expect(undeclaredModules(other, root)).toEqual([]);
  });

  it('names nothing for a failure outside an installed package', () => {
    const own = new ResolveError('failed', undefined, [
      { text: 'Could not resolve "react"', location: { file: '.edgefit/entry-0.mjs' } },
    ] as never);
    expect(undeclaredModules(own, root)).toEqual([]);
  });

  it('writes the reason', () => {
    expect(neededMessage(['react'])).toBe('needs "react", which the package does not declare');
  });
});

describe('summaryOf', () => {
  it('leaves an unchecked entry out, unless every entry is unchecked', () => {
    expect(summaryOf(['pass', 'unchecked'])).toBe('pass');
    expect(summaryOf(['warn', 'unchecked', 'pass'])).toBe('warn');
    expect(summaryOf(['unchecked', 'unchecked'])).toBe('error');
    expect(summaryOf(['unchecked', 'error'])).toBe('error');
    expect(summaryOf([])).toBe('pass');
  });
});

describe('a package with an entry that needs a module it does not declare', () => {
  it('lists the entry as unchecked and decides the row from the others', async () => {
    const result = await checkPackage(fixture('packages/needs-module'), { targets: ['workerd'] });
    const extra = result.entries.find(entry => entry.subpath === './extra');
    expect(extra?.results.workerd).toEqual({
      status: 'unchecked',
      errors: 0,
      warnings: 0,
      message: 'needs "edgefit-not-installed", which the package does not declare',
    });
    expect(result.summary.workerd).toBe('pass');
  });
});
