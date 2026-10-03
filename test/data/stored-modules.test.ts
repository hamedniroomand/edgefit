import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { findStoredModule, loadStoredModules } from '@/data/stored-modules.ts';
import type { StoredModuleEntry, StoredModuleQuery } from '@/data/stored-modules.ts';

const entry: StoredModuleEntry = {
  package: 'follow-redirects',
  versions: { min: '1.14.0' },
  file: 'index.js',
  modules: ['node:http', 'node:https'],
  members: ['request'],
  reason: 'The file calls only request of the module it stores.',
  source: 'https://example.com/why',
};

const query: StoredModuleQuery = {
  package: 'follow-redirects',
  version: '1.16.1',
  file: 'node_modules/follow-redirects/index.js',
  module: 'node:http',
};

function dataWith(overrides: Record<string, unknown>): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-stored-'));
  writeFileSync(
    path.join(directory, 'stored-modules.json'),
    JSON.stringify({ version: 1, entries: [{ ...entry, ...overrides }] }),
  );
  return directory;
}

describe('the shipped stored-modules data', () => {
  it('is valid and names a package, a file, the modules, the members, a reason and a source', () => {
    const entries = loadStoredModules();
    expect(entries.length).toBeGreaterThan(0);
    for (const item of entries) {
      expect(item.versions.min).toMatch(/^\d+\.\d+\.\d+$/u);
      expect(item.source).toMatch(/^https:\/\//u);
      expect(item.file).not.toMatch(/^\/|node_modules/u);
      expect(item.modules.length * item.members.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['no members', { members: [] }, 'package, file, modules, members and reason are required'],
    ['no reason', { reason: ' ' }, 'package, file, modules, members and reason are required'],
    [
      'a module that is not a Node.js module',
      { modules: ['http'] },
      'modules must be Node.js modules',
    ],
    [
      'a version that is not major.minor.patch',
      { versions: { min: '1.14' } },
      'versions must be major.minor.patch',
    ],
    [
      'a max that is not major.minor.patch',
      { versions: { min: '1.14.0', max: 'x' } },
      'versions must be major.minor.patch',
    ],
    ['a source that is not a link', { source: 'follow' }, 'source must be an https link'],
  ])('rejects %s', (_name, overrides, message) => {
    expect(() => loadStoredModules(dataWith(overrides))).toThrow(message);
  });

  it('reads a range without a max', () => {
    expect(loadStoredModules(dataWith({}))[0]?.versions).toEqual({ min: '1.14.0' });
  });
});

describe('matching an entry', () => {
  it('matches the package, module, file and a release above the min', () => {
    expect(findStoredModule([entry], query)).toBe(entry);
    expect(findStoredModule([entry], { ...query, module: 'node:https' })).toBe(entry);
  });

  it.each([
    ['another package', { package: 'other' }],
    ['another module', { module: 'node:net' }],
    ['another file', { file: 'node_modules/follow-redirects/debug.js' }],
    ['a release below the min', { version: '1.13.9' }],
  ])('does not match %s', (_name, change) => {
    expect(findStoredModule([entry], { ...query, ...change })).toBeUndefined();
  });

  it('stops at a max when the entry has one', () => {
    const closed = { ...entry, versions: { min: '1.14.0', max: '1.16.0' } };
    expect(findStoredModule([closed], query)).toBeUndefined();
  });
});
