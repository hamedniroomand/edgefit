import { describe, expect, it } from 'vite-plus/test';

import { apiRefFor, runtimeCompatDataProvider } from '@/data/providers/runtime-compat-data.ts';

import { dataDirectoryWith } from './data-fixture.ts';

const url = 'https://www.npmjs.com/package/runtime-compat-data/v/1';

function support(workerd: boolean | null, deno: boolean): object {
  return {
    __compat: { support: { workerd: { version_added: workerd }, deno: [{ version_added: deno }] } },
  };
}

const dataDirectory = dataDirectoryWith({
  'source.json': {
    sources: [{ provider: 'runtime-compat-data', url, license: 'CC0-1.0', versions: { npm: '1' } }],
  },
  'runtime-compat-data/data.json': {
    api: {
      BroadcastChannel: {
        ...support(false, true),
        BroadcastChannel: support(false, true),
        postMessage: support(false, true),
      },
      Navigator: { ...support(true, true), gpu: support(true, false), locks: support(null, true) },
    },
    javascript: { builtins: { Array: support(true, true) } },
  },
});

describe('runtime-compat-data provider', () => {
  it('maps BCD keys to the globals code reaches them through', () => {
    expect(apiRefFor('api.BroadcastChannel')).toEqual({
      module: '*globals*',
      path: ['BroadcastChannel'],
    });
    expect(apiRefFor('api.URL.canParse_static')).toEqual({
      module: '*globals*',
      path: ['URL', 'canParse'],
    });
    expect(apiRefFor('api.Navigator.locks')).toEqual({
      module: '*globals*',
      path: ['navigator', 'locks'],
    });
    expect(apiRefFor('api.SubtleCrypto.digest')).toEqual({
      module: '*globals*',
      path: ['crypto', 'subtle', 'digest'],
    });
  });

  it('leaves out keys without a global path', () => {
    expect(apiRefFor('api.BroadcastChannel.BroadcastChannel')).toBeUndefined();
    expect(apiRefFor('api.BroadcastChannel.postMessage')).toBeUndefined();
    expect(apiRefFor('api.BroadcastChannel.message_event')).toBeUndefined();
    expect(apiRefFor('api.AbortSignal.abort_static.reason_parameter')).toBeUndefined();
    expect(apiRefFor('javascript.builtins.Array')).toBeUndefined();
  });

  it('turns support statements into entries for one runtime', () => {
    const entries = runtimeCompatDataProvider('workerd').load(dataDirectory);
    expect(entries.map(entry => [entry.path.join('.'), entry.status, entry.category])).toEqual([
      ['BroadcastChannel', 'unsupported', 'web'],
      ['Navigator', 'supported', undefined],
      ['navigator.gpu', 'supported', undefined],
    ]);
    expect(entries[0]?.source).toEqual({ provider: 'runtime-compat-data', version: '1', url });
  });

  it('reads the first of several support statements', () => {
    const entries = runtimeCompatDataProvider('deno').load(dataDirectory);
    expect(entries.find(entry => entry.path.join('.') === 'navigator.gpu')?.status).toBe(
      'unsupported',
    );
  });
});
