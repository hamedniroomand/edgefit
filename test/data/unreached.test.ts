import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { collectFindings, defaultLevels } from '@/core/findings.ts';
import type { ModuleUsages } from '@/core/findings.ts';
import { compareVersions, fileInPackage, findUnreached, loadUnreached } from '@/data/unreached.ts';
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

  it('finds the file below the package inside a pnpm store path', () => {
    const stored = `node_modules/.pnpm/next@16.3.8_react@19/node_modules/next/${entry.file}`;
    expect(fileInPackage(stored, 'next')).toBe(entry.file);
    expect(fileInPackage('src/index.ts', 'next')).toBeUndefined();
  });

  it('compares versions by number, not by text', () => {
    expect(compareVersions('16.10.0', '16.9.0')).toBeGreaterThan(0);
    expect(compareVersions('16.3.8', '16.3.8')).toBe(0);
    expect(compareVersions('16.3.8', '17.0.0')).toBeLessThan(0);
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
