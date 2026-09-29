import { describe, expect, it } from 'vite-plus/test';

import { matrixProvider } from '@/data/providers/matrix.ts';

import { dataDirectoryWith } from './data-fixture.ts';

const dataDirectory = dataDirectoryWith({
  'source.json': {
    sources: [
      {
        provider: 'workers-nodejs-compat-matrix',
        url: 'https://github.com/cloudflare/workers-nodejs-compat-matrix',
        commit: 'abc1234',
        license: 'MIT',
        versions: { bun: '1.3.13' },
      },
    ],
  },
  'workers-nodejs-compat-matrix/baseline.json': {
    fs: { '*self*': 'object', watch: 'function' },
    'node:sqlite': { '*self*': 'object', DatabaseSync: 'class' },
  },
  'workers-nodejs-compat-matrix/bun.json': {
    fs: { '*self*': 'object', watch: 'missing' },
  },
});

describe('matrix provider', () => {
  const tree = matrixProvider('bun').load(dataDirectory);

  it('reads the baseline and the runtime dump as trees', () => {
    expect(tree.baseline.fs).toEqual({ '*self*': 'object', watch: 'function' });
    expect(tree.runtime.fs).toEqual({ '*self*': 'object', watch: 'missing' });
  });

  it('keys prefix-only modules without the node: prefix', () => {
    expect(Object.keys(tree.baseline)).toEqual(['fs', 'sqlite']);
  });

  it('names the runtime version and the pinned commit', () => {
    expect(tree.source).toEqual({
      provider: 'workers-nodejs-compat-matrix',
      version: '1.3.13',
      url: 'https://github.com/cloudflare/workers-nodejs-compat-matrix/tree/abc1234',
    });
  });
});
