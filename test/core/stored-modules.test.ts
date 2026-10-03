import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { readStoredModules } from '@/core/stored-modules.ts';
import type { StoredModuleEntry } from '@/data/stored-modules.ts';
import type { Usage } from '@/types.ts';
import { fixture, makeUsage } from '~/helpers.ts';

const entry: StoredModuleEntry = {
  package: 'follow-redirects',
  versions: { min: '1.14.0' },
  file: 'index.js',
  modules: ['node:http'],
  members: ['request', 'get'],
  reason: 'The file calls only request and get of the module it stores.',
  source: 'https://example.com/why',
};

const file = 'node_modules/follow-redirects/index.js';

function stored(parts: Partial<Usage> = {}): Usage {
  return makeUsage(
    { module: 'http', path: [] },
    {
      kind: 'dynamic',
      display: 'node:http',
      reason: 'passed on as a value',
      location: { file, line: 717, column: 31 },
      ...parts,
    },
  );
}

function read(usage: Usage = stored(), version: string | null = '1.16.1'): Usage[] {
  const [module] = readStoredModules(
    [{ package: { name: 'follow-redirects', version: version ?? undefined }, usages: [usage] }],
    [entry],
  );
  return module?.usages ?? [];
}

describe('a module that a listed file stores and passes on', () => {
  it('becomes a usage of each member the entry lists, at the same place', () => {
    const usages = read();
    expect(usages.map(usage => usage.display)).toEqual(['node:http.request', 'node:http.get']);
    expect(usages.map(usage => usage.kind)).toEqual(['api', 'api']);
    expect(usages[0]?.api).toEqual({ module: 'http', path: ['request'] });
    expect(usages[0]?.location).toEqual({ file, line: 717, column: 31 });
    expect(usages[0]?.reason).toBeUndefined();
  });

  it('keeps the flags of the usage', () => {
    expect(read(stored({ guarded: true, caught: true })).map(usage => usage.guarded)).toEqual([
      true,
      true,
    ]);
  });

  it.each([
    ['another file', stored({ location: { file: `${file}.map`, line: 1, column: 1 } })],
    ['another module', stored({ display: 'node:net' })],
    ['a usage that is not dynamic', stored({ kind: 'api' })],
    [
      'a usage with no API',
      makeUsage(undefined, { kind: 'dynamic', location: { file, line: 1, column: 1 } }),
    ],
  ])('stays as it is for %s', (_name, usage) => {
    expect(read(usage)).toEqual([usage]);
  });

  it('stays as it is for a release below the range, and for a package with no version', () => {
    expect(read(stored(), '1.13.0')).toEqual([stored()]);
    expect(read(stored(), null)).toEqual([stored()]);
  });

  it('leaves the usages of the project itself alone', () => {
    const own = stored();
    const [module] = readStoredModules([{ package: undefined, usages: [own] }], [entry]);
    expect(module?.usages).toEqual([own]);
  });
});

async function denoFindings(app: string): Promise<string[]> {
  const result = await check({ root: fixture(app), config: { targets: ['deno'] } });
  return (result.reports[0]?.findings ?? []).map(
    finding => `${finding.category} ${finding.api} ${finding.package?.name ?? '.'}`,
  );
}

describe('a project that imports a package file that stores a module', () => {
  it('has no unknown finding in a release the data lists', async () => {
    expect(await denoFindings('stored-app')).toEqual([]);
  });

  it('has the unknown finding in a release below the listed range', async () => {
    expect(await denoFindings('stored-app-old')).toEqual(['unknown node:http follow-redirects']);
  });
});
