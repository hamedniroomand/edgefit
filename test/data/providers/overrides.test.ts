import { describe, expect, it } from 'vite-plus/test';

import { CompatIndex } from '@/data/compat-index.ts';
import { overridesProvider } from '@/data/providers/overrides.ts';
import type { CompatEntry } from '@/data/providers/provider.ts';

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

const load = (apis: Record<string, unknown>): CompatEntry[] =>
  overridesProvider('workerd').load(
    dataDirectoryWith({
      'source.json': {
        sources: [
          { provider: 'overrides/workerd', url, license: 'MIT', versions: { workerd: '1' } },
        ],
      },
      'overrides/workerd.json': { modules: {}, apis },
    }),
  );
const mismatch = (options: unknown): Record<string, unknown> => ({
  'tls.connect': { status: 'mismatch', note: 'throws', source: 'tls.ts', options },
});

describe('override options', () => {
  it('carries the options to the lookup', () => {
    const options = ['ALPNProtocols', { key: 'rejectUnauthorized', value: false }];
    const tree = { baseline: {}, runtime: {}, source: { provider: 'matrix', version: '1' } };
    const index = new CompatIndex(tree, load(mismatch(options)));
    expect(index.lookup({ module: 'tls', path: ['connect'] }).options).toEqual(options);
  });

  it.each([
    ['an empty list', [], 'must be a list with one item or more'],
    ['a string in place of a list', 'ALPNProtocols', 'must be a list with one item or more'],
    ['a list with a number', ['ALPNProtocols', 1], 'have an item of a wrong type'],
    ['an item without a key', [{ value: false }], 'have an item of a wrong type'],
    ['an item with an object value', [{ key: 'ca', value: {} }], 'have an item of a wrong type'],
    ['a gate without a date', [{ key: 'ca', gate: { flag: 'f' } }], 'have an item of a wrong type'],
    ['a gate that is a string', [{ key: 'ca', gate: 'f' }], 'have an item of a wrong type'],
  ])('gives a load error for %s', (_name, options, reason) => {
    expect(() => load(mismatch(options))).toThrow(
      `overrides/workerd.json: the options of tls.connect ${reason}`,
    );
  });

  it('accepts an item with a key and a gate', () => {
    const gate = { flag: 'f', date: '2026-01-01', disableFlag: 'no_f' };
    expect(load(mismatch([{ key: 'ca', gate }]))[0]?.options).toEqual([{ key: 'ca', gate }]);
  });

  it('gives a load error for options on a status other than mismatch', () => {
    const apis = {
      'tls.connect': { status: 'unsupported', note: 'x', source: 'tls.ts', options: ['ca'] },
    };
    expect(() => load(apis)).toThrow(
      'the options of tls.connect are allowed only with the status mismatch, and the status is unsupported',
    );
  });
});
