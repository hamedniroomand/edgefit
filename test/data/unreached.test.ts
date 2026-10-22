import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { collectFindings, defaultLevels } from '@/core/findings.ts';
import type { ModuleUsages } from '@/core/findings.ts';
import { fileInPackage, findUnreached, loadUnreached } from '@/data/unreached.ts';
import type { UnreachedEntry, UnreachedQuery } from '@/data/unreached.ts';
import { makeUsage, stubTarget } from '~/helpers.ts';

const entry: UnreachedEntry = {
  package: 'next',
  versions: { min: '16.3.8', max: '16.3.9' },
  file: 'dist/esm/server/app-render/cache-signal.js',
  apis: ['node:fs.watch'],
  target: 'workerd',
  reason: 'Only used with Cache Components.',
  source: 'https://example.com/why',
};

const file = 'node_modules/next/dist/esm/server/app-render/cache-signal.js';
const query: UnreachedQuery = {
  package: 'next',
  version: '16.3.8',
  file,
  api: 'node:fs.watch',
  target: 'workerd',
  optionsSet: new Set(),
};

function dataWith(overrides: Record<string, unknown>): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-unreached-'));
  writeFileSync(
    path.join(directory, 'unreached.json'),
    JSON.stringify({ version: 1, entries: [{ ...entry, ...overrides }] }),
  );
  return directory;
}

describe('the shipped unreached data', () => {
  it('is valid and names a package, a file, the APIs, a reason and a source', () => {
    const entries = loadUnreached();
    expect(entries.length).toBeGreaterThan(0);
    for (const item of entries) {
      expect(item.versions.min).toMatch(/^\d+\.\d+\.\d+$/u);
      expect(item.source).toMatch(/^https:\/\//u);
      expect(item.file).not.toMatch(/^\/|node_modules/u);
      for (const guard of item.guards ?? []) {
        expect(guard).not.toMatch(/^\/|node_modules|\.\./u);
        expect(guard).not.toBe(item.file);
      }
    }
  });

  it.each([
    ['an empty reason', { reason: ' ' }, 'package, file, apis and reason are required'],
    ['no APIs', { apis: [] }, 'package, file, apis and reason are required'],
    ['an unknown target', { target: 'node' }, 'target must be a known target key'],
    [
      'a version that is not major.minor.patch',
      { versions: { min: '16', max: '16.3.9' } },
      'versions must be major.minor.patch',
    ],
    ['a source that is not a link', { source: 'next' }, 'source must be an https link'],
    ['an empty list of options', { options: [] }, 'options must be a list of one or more'],
    ['a blank option name', { options: [' '] }, 'options must be a list of one or more'],
    ['an option that is not text', { options: [1] }, 'options must be a list of one or more'],
    ['options that are not a list', { options: 'http2' }, 'options must be a list of one or more'],
    ['an empty list of guards', { guards: [] }, 'guards must be a list of one or more paths'],
    ['a blank guard', { guards: [' '] }, 'guards must be a list of one or more paths'],
    ['a guard that is not text', { guards: [1] }, 'guards must be a list of one or more paths'],
    [
      'guards that are not a list',
      { guards: 'a.js' },
      'guards must be a list of one or more paths',
    ],
    ['an absolute guard', { guards: ['/dist/a.js'] }, 'guards must be a list of one or more paths'],
    ['a guard with a .. segment', { guards: ['dist/../a.js'] }, 'guards must be a list of one or'],
  ])('rejects %s', (_name, overrides, message) => {
    expect(() => loadUnreached(dataWith(overrides))).toThrow(message);
  });

  it('rejects another file version', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-unreached-'));
    writeFileSync(path.join(directory, 'unreached.json'), '{"version":2,"entries":[]}');
    expect(() => loadUnreached(directory)).toThrow('expected 1');
  });
});

describe('matching an entry', () => {
  it('matches the package, version range, file, API and target', () => {
    expect(findUnreached([entry], query)).toBe(entry);
    expect(findUnreached([entry], { ...query, version: '16.3.9' })).toBe(entry);
  });

  it.each<[string, Partial<UnreachedQuery>]>([
    ['another package', { package: 'react' }],
    ['a version below the range', { version: '16.3.7' }],
    ['a version above the range', { version: '16.4.0' }],
    ['another file', { file: 'node_modules/next/dist/esm/server/other.js' }],
    ['another API', { api: 'node:fs.cp' }],
    ['another target', { target: 'bun' }],
  ])('does not match %s', (_name, change) => {
    expect(findUnreached([entry], { ...query, ...change })).toBeUndefined();
  });

  describe('an entry that names options', () => {
    const withOptions: UnreachedEntry = { ...entry, options: ['http2', 'h2'] };
    it.each<[string, string[]]>([
      ['no file sets an option', []],
      ['a file sets another option', ['http3']],
    ])('matches when %s', (_name, names) => {
      const optionsSet = new Set(names);
      expect(findUnreached([withOptions], { ...query, optionsSet })).toBe(withOptions);
    });

    it.each<[string, string[]]>([
      ['the project sets the first option', ['http2']],
      ['the project sets the second option', ['h2']],
      ['the project sets both options', ['h2', 'http2']],
    ])('does not match when %s', (_name, names) => {
      const optionsSet = new Set(names);
      expect(findUnreached([withOptions], { ...query, optionsSet })).toBeUndefined();
    });

    it('matches an entry without options whatever the project sets', () => {
      expect(findUnreached([entry], { ...query, optionsSet: new Set(['http2']) })).toBe(entry);
    });
  });

  it('finds the file below the package inside a pnpm store path', () => {
    const stored = `node_modules/.pnpm/next@16.3.8_react@19/node_modules/next/${entry.file}`;
    expect(fileInPackage(stored, 'next')).toBe(entry.file);
    expect(fileInPackage('src/index.ts', 'next')).toBeUndefined();
  });
});

describe('findings in code that is not reached', () => {
  const target = stubTarget({
    'fs.watch': { status: 'unsupported', note: 'does not exist on the target' },
  });
  const usage = makeUsage(
    { module: 'fs', path: ['watch'] },
    { location: { file, line: 36, column: 40 } },
  );
  const module = (version: string): ModuleUsages => ({
    file,
    package: { name: 'next', version },
    chain: ['index.js', 'next'],
    usages: [usage],
  });

  it('become guarded, with the reason and the source', () => {
    const { findings, guarded } = collectFindings([module('16.3.8')], {
      target,
      levels: defaultLevels,
      ignore: [],
      unreached: [entry],
    });
    expect(findings).toEqual([]);
    expect(guarded[0]).toMatchObject({
      guarded: true,
      unreached: { reason: entry.reason, source: entry.source },
    });
  });

  it('stay findings outside the version range, or with no data', () => {
    const base = { target, levels: defaultLevels, ignore: [] };
    expect(
      collectFindings([module('16.4.0')], { ...base, unreached: [entry] }).findings,
    ).toHaveLength(1);
    expect(collectFindings([module('16.3.8')], base).findings).toHaveLength(1);
  });
});

describe('a warning in code that is not reached', () => {
  const gotFile = 'node_modules/got/dist/source/core/utils/http2-client.js';
  const target = stubTarget({
    'tls.connect': { status: 'mismatch', note: 'throws for some options' },
  });
  const usage = makeUsage(
    { module: 'tls', path: ['connect'] },
    { location: { file: gotFile, line: 235, column: 15 } },
  );
  const module: ModuleUsages = {
    file: gotFile,
    package: { name: 'got', version: '16.1.0' },
    chain: ['index.js', 'got'],
    usages: [usage],
  };
  const base = { target, levels: defaultLevels, ignore: [] };

  it('is guarded by the shipped entry for the HTTP/2 client of got', () => {
    expect(collectFindings([module], base).findings).toMatchObject([
      { level: 'warning', category: 'mismatch' },
    ]);
    const { findings, guarded } = collectFindings([module], {
      ...base,
      unreached: loadUnreached(),
    });
    expect(findings).toEqual([]);
    expect(guarded).toMatchObject([{ level: 'warning', category: 'mismatch', guarded: true }]);
    expect(guarded[0]?.unreached).toBeDefined();
  });
});
