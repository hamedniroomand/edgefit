import { describe, expect, it } from 'vite-plus/test';

import { loadTargetData } from '@/targets/target-data.ts';
import { dataDirectoryWith } from '~/data/providers/data-fixture.ts';

function override(status: string, note: string): Record<string, string> {
  return { status, note, source: 'x.md' };
}

const files = {
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
      {
        provider: 'dom-globals',
        url: 'https://example.com/dom',
        license: 'Apache-2.0',
        versions: { typescript: '5' },
      },
    ],
  },
  'dom-globals.json': {
    names: ['DOMParser', 'alert', 'caches'],
    presentOn: { deno: ['alert'] },
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
    present: { zz: { note: 'loads', source: 'zz.md' } },
    apis: {},
  },
  'overrides/deno-deploy.json': {
    modules: { child_process: override('unsupported', 'no subprocesses') },
    apis: { 'fs.writeFile': override('unsupported', 'read-only file system') },
  },
};
const dataDirectory = dataDirectoryWith(files);

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
        'Web APIs from runtime-compat-data@abcdef0 (npm 1), ' +
        'DOM globals from dom-globals (typescript 5)',
    );
  });
});

describe('target data with DOM globals', () => {
  const { index, globals } = loadTargetData('deno', [], dataDirectory);

  it('reports a DOM global that the runtime lacks as a missing global, read at load only', () => {
    expect(index.lookup({ module: '*globals*', path: ['DOMParser'] })).toMatchObject({
      status: 'unsupported',
      absent: true,
      loadOnly: true,
    });
    expect(globals.has('DOMParser')).toBe(true);
  });

  it('leaves out a DOM global that the runtime has', () => {
    expect(index.lookup({ module: '*globals*', path: ['alert'] }).status).not.toBe('unsupported');
    expect(globals.has('alert')).toBe(false);
  });

  it('lets the Web API data win for a name that both list', () => {
    expect(index.lookup({ module: '*globals*', path: ['caches'] })).toMatchObject({
      category: 'web',
    });
  });
});

describe('target data with a global that only an override lists', () => {
  const absent = dataDirectoryWith({
    ...files,
    'overrides/deno.json': {
      modules: {},
      apis: {
        '*globals*.document': {
          ...override('unsupported', 'missing'),
          absent: true,
          loadOnly: 'bare',
        },
      },
    },
  });

  it('tracks the global, because a plain read of it fails', () => {
    expect(loadTargetData('deno', [], absent).globals.has('document')).toBe(true);
    expect(loadTargetData('deno', [], dataDirectory).globals.has('document')).toBe(false);
  });
});

describe('target data globals', () => {
  it('tracks a global whose only problem is an entry with options', () => {
    const options = dataDirectoryWith({
      ...files,
      'overrides/deno.json': {
        modules: {},
        apis: {
          '*globals*.BroadcastChannel': { ...override('mismatch', 'throws'), options: ['x'] },
        },
      },
    });
    expect(loadTargetData('deno', [], options).globals.has('BroadcastChannel')).toBe(true);
  });
});

describe('target data with a module recorded as present', () => {
  const { index } = loadTargetData('deno', [], dataDirectory);

  it('supports the module itself, with its source, and leaves its members uncovered', () => {
    const module = index.lookup({ module: 'zz', path: [] });
    expect(module.status).toBe('supported');
    expect(module.source).toBe('https://example.com/deno/zz.md');
    expect(index.lookup({ module: 'zz', path: ['x'] }).status).toBe('uncovered');
  });
});
