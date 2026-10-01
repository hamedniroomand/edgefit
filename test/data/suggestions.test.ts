import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { findSuggestion, loadSuggestions } from '@/data/suggestions.ts';
import type { SuggestionData, SuggestionEntry } from '@/data/suggestions.ts';
import { fixturesDirectory } from '~/helpers.ts';

const entry: SuggestionEntry = {
  targets: ['workerd'],
  kind: 'change',
  text: 'Do it elsewhere.',
  source: 'https://example.com/why',
  reviewed: '2026-09-30',
};

function dataWith(overrides: Partial<SuggestionEntry>, group = 'apis'): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-suggestions-'));
  const file = {
    version: 1,
    packages: {},
    apis: {},
    [group]: { key: [{ ...entry, ...overrides }] },
  };
  writeFileSync(path.join(directory, 'suggestions.json'), JSON.stringify(file));
  return directory;
}

describe('the shipped suggestions', () => {
  const data = loadSuggestions();
  const entries = [...Object.values(data.packages), ...Object.values(data.apis)].flat();

  it('are valid, and every entry names its source and when it was reviewed', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const item of entries) {
      expect(item.source).toMatch(/^https:\/\//u);
      expect(item.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    }
  });

  it('only replace a package with one that edgefit finds nothing to report for', async () => {
    const replacements = entries.filter(candidate => candidate.kind === 'replace');
    await Promise.all(
      replacements.flatMap(item =>
        item.targets.map(async target => {
          const root = path.join(fixturesDirectory, 'suggestions', item.package ?? '?');
          expect(existsSync(path.join(root, 'src/index.js'))).toBe(true);
          const config = { targets: [target], entry: 'src/index.js' };
          const [report] = (await check({ root, config })).reports;
          expect(report?.findings).toEqual([]);
        }),
      ),
    );
  });
});

describe('validating suggestions', () => {
  it.each([
    [{ targets: [] }, 'targets'],
    [{ targets: ['nowhere' as never] }, 'targets'],
    [{ kind: 'rewrite' as never }, 'kind'],
    // A setting needs its name and value, and only edgefit's own hints have them.
    [{ kind: 'setting' as never }, 'kind'],
    [{ text: ' ' }, 'text'],
    [{ kind: 'replace' as const }, 'package'],
    [{ source: 'http://example.com' }, 'source'],
    [{ reviewed: 'yesterday' }, 'reviewed'],
  ])('rejects %j', (overrides, problem) => {
    expect(() => loadSuggestions(dataWith(overrides))).toThrow(problem);
  });

  it('rejects another version of the file', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-suggestions-'));
    writeFileSync(
      path.join(directory, 'suggestions.json'),
      JSON.stringify({ version: 2, packages: {}, apis: {} }),
    );
    expect(() => loadSuggestions(directory)).toThrow('version');
  });
});

describe('finding a suggestion', () => {
  const data: SuggestionData = {
    packages: {
      chokidar: [{ ...entry, text: 'package', apis: ['node:fs.*'] }],
      other: [{ ...entry, targets: ['bun'], text: 'bun only' }],
    },
    apis: {
      'node:fs.watch': [{ ...entry, text: 'api' }],
      'node:child_process*': [{ ...entry, text: 'prefix' }],
    },
  };
  const find = (api: string, pkg?: string, target = 'workerd' as const): unknown =>
    findSuggestion(data, { api, package: pkg, target })?.text;

  it('prefers the entry for the package over the one for the API', () => {
    expect(find('node:fs.watch', 'chokidar')).toBe('package');
    expect(find('node:fs.watch')).toBe('api');
  });

  it('falls back to the API when the package entry does not cover it', () => {
    expect(find('node:fs.watch', 'chokidar-like')).toBe('api');
    expect(find('node:child_process.spawn', 'chokidar')).toBe('prefix');
  });

  it('only suggests for the targets an entry lists', () => {
    expect(find('node:fs.watch', 'other')).toBe('api');
    expect(find('node:fs.watch', 'other', 'bun' as never)).toBe('bun only');
    expect(find('node:fs.watch', undefined, 'bun' as never)).toBeUndefined();
  });
  it('carries the target and source, and says nothing for an unknown API', () => {
    expect(
      findSuggestion(data, { api: 'node:fs.watch', package: undefined, target: 'workerd' }),
    ).toEqual({
      kind: 'change',
      text: 'api',
      target: 'workerd',
      source: 'https://example.com/why',
    });
    expect(find('node:os.cpus')).toBeUndefined();
  });
});

describe('choosing among the API entries', () => {
  it('prefers an exact key, then the longest prefix, whatever order the file lists them in', () => {
    const ordered: SuggestionData = {
      packages: {},
      apis: {
        'node:fs*': [{ ...entry, text: 'short prefix' }],
        'node:fs.watch*': [{ ...entry, text: 'long prefix' }],
        'node:fs.watchFile': [{ ...entry, text: 'exact' }],
      },
    };
    const text = (api: string): unknown =>
      findSuggestion(ordered, { api, package: undefined, target: 'workerd' })?.text;
    expect(text('node:fs.watchFile')).toBe('exact');
    expect(text('node:fs.watchers')).toBe('long prefix');
    expect(text('node:fs.cp')).toBe('short prefix');
  });
});
