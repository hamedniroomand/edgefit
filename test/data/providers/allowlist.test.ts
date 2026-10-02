import { describe, expect, it } from 'vite-plus/test';

import { allowlistProvider } from '@/data/providers/allowlist.ts';

import { dataDirectoryWith } from './data-fixture.ts';

const dataDirectory = dataDirectoryWith({
  'source.json': {
    sources: [
      {
        provider: 'allowlist/vercel-edge',
        url: 'https://vercel.com/docs',
        license: 'none',
        versions: { 'vercel-edge': '2026-10-03' },
      },
    ],
  },
  'workers-nodejs-compat-matrix/baseline.json': {
    '*globals*': { fetch: 'function', WeakRef: 'function', Float16Array: 'function' },
  },
  'allowlists/vercel-edge.json': {
    modules: {},
    globals: ['fetch'],
    languageGlobals: [],
    emulatorGlobals: [],
    witnessGlobals: ['WeakRef', 'AsyncLocalStorage'],
    globalMembers: {},
  },
});

describe('allowlist provider', () => {
  const { runtime } = allowlistProvider('vercel-edge').load(dataDirectory);

  it('keeps the globals the witness measured, as the other lists', () => {
    expect(runtime['*globals*']).toEqual({
      '*self*': 'object',
      fetch: 'function',
      WeakRef: 'function',
    });
  });
});
