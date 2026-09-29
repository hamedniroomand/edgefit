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
    },
    apis: {
      'fs.promises.watch': { status: 'unsupported', note: 'throws', source: 'fs.ts' },
      'fs/promises.watch': { status: 'unsupported', note: 'throws', source: 'fs.ts' },
    },
  },
});

describe('overrides provider', () => {
  const entries = overridesProvider('workerd').load(dataDirectory);

  it('turns module and API overrides into flat entries', () => {
    expect(entries.map(entry => [entry.module, entry.path, entry.status])).toEqual([
      ['dgram', ['isIP'], 'supported'],
      ['dgram', [], 'mocked'],
      ['fs', ['promises', 'watch'], 'unsupported'],
      ['fs/promises', ['watch'], 'unsupported'],
    ]);
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
