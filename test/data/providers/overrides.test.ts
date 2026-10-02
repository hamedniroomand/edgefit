import { describe, expect, it } from 'vite-plus/test';

import { overridesProvider } from '@/data/providers/overrides.ts';

import { dataDirectoryWith } from './data-fixture.ts';

const url = 'https://github.com/cloudflare/workerd/tree/v1/src/node';

const dataDirectory = dataDirectoryWith({
  'source.json': {
    sources: [{ provider: 'overrides/workerd', url, license: 'MIT', versions: { workerd: '1' } }],
  },
  'overrides/workerd.json': {
    modules: {
      dgram: { status: 'mocked', note: 'no-op', source: 'dgram.ts', except: ['isIP'] },
      wasi: {
        status: 'unsupported',
        note: 'missing',
        source: 'wasi.ts',
        except: ['WASI'],
        absent: true,
      },
    },
    apis: {
      'fs.promises.watch': { status: 'unsupported', note: 'throws', source: 'fs.ts' },
      '*globals*.reportError': {
        status: 'supported',
        note: 'exists',
        source: '../workerd/api/global-scope.c++',
      },
      'fs/promises.watch': { status: 'unsupported', note: 'throws', source: 'fs.ts' },
      'fs.glob': { status: 'unsupported', note: 'missing', source: 'fs.ts', absent: true },
    },
  },
});

describe('overrides provider', () => {
  const entries = overridesProvider('workerd').load(dataDirectory);

  it('turns module and API overrides into flat entries', () => {
    expect(entries.map(entry => [entry.module, entry.path, entry.status])).toEqual([
      ['dgram', ['isIP'], 'supported'],
      ['dgram', [], 'mocked'],
      ['wasi', ['WASI'], 'supported'],
      ['wasi', [], 'unsupported'],
      ['fs', ['promises', 'watch'], 'unsupported'],
      ['*globals*', ['reportError'], 'supported'],
      ['fs/promises', ['watch'], 'unsupported'],
      ['fs', ['glob'], 'unsupported'],
    ]);
  });

  it('resolves a source path that leaves the override directory', () => {
    expect(entries.find(entry => entry.module === '*globals*')?.source.url).toBe(
      'https://github.com/cloudflare/workerd/tree/v1/src/workerd/api/global-scope.c++',
    );
  });

  it('links each entry to the runtime source it was read from', () => {
    expect(entries[1]).toEqual({
      target: 'workerd',
      module: 'dgram',
      path: [],
      status: 'mocked',
      note: 'no-op',
      source: { provider: 'overrides/workerd', version: '1', url: `${url}/dgram.ts` },
    });
  });
});

describe('absent overrides', () => {
  const entries = overridesProvider('workerd').load(dataDirectory);

  it('marks an absent API, but not the members an override lets work', () => {
    const absentOf = (module: string, ...path: string[]): boolean | undefined =>
      entries.find(entry => entry.module === module && entry.path.join('.') === path.join('.'))
        ?.absent;
    expect(absentOf('fs', 'glob')).toBe(true);
    expect(absentOf('wasi')).toBe(true);
    expect(absentOf('wasi', 'WASI')).toBeUndefined();
    expect(absentOf('fs', 'promises', 'watch')).toBeUndefined();
  });

  it('ignores absent on a status that says the API exists', () => {
    const mocked = overridesProvider('workerd').load(
      dataDirectoryWith({
        'source.json': {
          sources: [
            { provider: 'overrides/workerd', url, license: 'MIT', versions: { workerd: '1' } },
          ],
        },
        'overrides/workerd.json': {
          modules: {},
          apis: {
            'dns.lookup': { status: 'mocked', note: 'no-op', source: 'dns.ts', absent: true },
          },
        },
      }),
    );
    expect(mocked[0]?.absent).toBeUndefined();
  });
});
