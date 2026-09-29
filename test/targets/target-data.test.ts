import { describe, expect, it } from 'vite-plus/test';

import { loadTargetData } from '@/targets/target-data.ts';
import { dataDirectoryWith } from '~/data/providers/data-fixture.ts';

function override(status: string, note: string): Record<string, string> {
  return { status, note, source: 'x.md' };
}

const dataDirectory = dataDirectoryWith({
  'source.json': {
    sources: [
      {
        provider: 'workers-nodejs-compat-matrix',
        url: 'https://example.com/matrix',
        commit: '0123456789',
        license: 'MIT',
        versions: { deno: '2' },
      },
      { provider: 'overrides/deno', url: 'https://example.com/deno', license: 'MIT', versions: {} },
      {
        provider: 'overrides/deno-deploy',
        url: 'https://example.com/deploy',
        license: 'MIT',
        versions: {},
      },
      {
        provider: 'runtime-compat-data',
        url: 'https://example.com/web',
        commit: 'abcdef0123',
        license: 'CC0-1.0',
        versions: { npm: '1' },
      },
    ],
  },
  'workers-nodejs-compat-matrix/baseline.json': {
    '*globals*': { BroadcastChannel: 'class' },
    fs: { writeFile: 'function' },
  },
  'workers-nodejs-compat-matrix/deno.json': {
    '*globals*': { BroadcastChannel: 'class' },
    fs: { writeFile: 'function' },
  },
  'runtime-compat-data/data.json': {
    api: {
      BroadcastChannel: { __compat: { support: { deno: { version_added: false } } } },
      caches: { __compat: { support: { deno: { version_added: false } } } },
    },
  },
  'overrides/deno.json': {
    modules: { child_process: { ...override('supported', 'implemented'), except: [] } },
    apis: {},
  },
  'overrides/deno-deploy.json': {
    modules: { child_process: override('unsupported', 'no subprocesses') },
    apis: { 'fs.writeFile': override('unsupported', 'read-only file system') },
  },
});

describe('target data layers', () => {
  const deno = loadTargetData('deno', [], dataDirectory);
  const deploy = loadTargetData('deno', ['deno-deploy'], dataDirectory);

  it('reports an API unsupported by an extra layer only when the layer is active', () => {
    const writeFile = { module: 'fs', path: ['writeFile'] };
    expect(deno.index.lookup(writeFile).status).toBe('supported');
    expect(deploy.index.lookup(writeFile)).toMatchObject({
      status: 'unsupported',
      note: 'read-only file system',
    });
  });

  it('lets the extra layer win over the runtime layer for the same API', () => {
    const spawn = { module: 'child_process', path: ['spawn'] };
    expect(deno.index.lookup(spawn).status).toBe('supported');
    expect(deploy.index.lookup(spawn).status).toBe('unsupported');
  });

  it('fills in Web APIs the matrix does not describe as web findings', () => {
    expect(deno.index.lookup({ module: '*globals*', path: ['caches', 'open'] })).toMatchObject({
      status: 'unsupported',
      category: 'web',
    });
    expect(deno.globals.has('caches')).toBe(true);
  });

  it('keeps the matrix result where the matrix describes the API', () => {
    const channel = { module: '*globals*', path: ['BroadcastChannel', 'prototype'] };
    expect(deno.index.lookup(channel).status).toBe('supported');
    expect(deno.globals.has('BroadcastChannel')).toBe(false);
  });

  it('describes every layer it applied', () => {
    expect(deploy.overrideSources.map(source => source.provider)).toEqual([
      'overrides/deno',
      'overrides/deno-deploy',
    ]);
    expect(deploy.description).toBe(
      'workers-nodejs-compat-matrix@0123456 (deno 2), curated overrides from ' +
        'https://example.com/deno and https://example.com/deploy, ' +
        'Web APIs from runtime-compat-data@abcdef0 (npm 1)',
    );
  });
});
