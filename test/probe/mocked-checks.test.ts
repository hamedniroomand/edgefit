import { execFileSync } from 'node:child_process';
import module from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { readOverrides } from '@scripts/probe/data.mjs';
import { loadNodeModule, mockedChecks, runMockedChecks } from '@scripts/probe/mocked-checks.mjs';
import { describe, expect, it } from 'vite-plus/test';

// The fakes stand in for APIs that accept every call and do nothing.
const noop = (): void => {
  // intentionally empty
};
const fakes: Record<string, unknown> = {
  async_hooks: {
    createHook: () => ({ enable: () => ({ disable: noop }), disable: noop }),
    executionAsyncId: () => 0,
    triggerAsyncId: () => 0,
    executionAsyncResource: () => process.stdin,
  },
  inspector: { open: noop, close: noop, url: noop },
  'inspector/promises': { open: noop, close: noop, url: noop },
  module: { register: noop, syncBuiltinESMExports: noop, createRequire: module.createRequire },
  process: {
    getActiveResourcesInfo: () => [],
    _getActiveHandles: () => [],
    _getActiveRequests: () => [],
    setSourceMapsEnabled: noop,
    sourceMapsEnabled: true,
  },
  v8: { setFlagsFromString: noop },
};
const loadFake = async (name: string): Promise<unknown> =>
  fakes[name] ?? (await loadNodeModule(name));
const apis = Object.keys(mockedChecks);
const allAs = (outcome: string): Record<string, string> =>
  Object.fromEntries(apis.map(api => [api, outcome]));

describe('mocked checks', () => {
  it('has a check for every curated mocked API', () => {
    const curated = ['bun', 'deno'].flatMap(runtime =>
      Object.entries(readOverrides(runtime))
        .filter(([, entry]) => entry.status === 'mocked')
        .map(([api]) => api),
    );
    expect(apis).toEqual(expect.arrayContaining(curated));
  });

  it('reports a no-op under a fake implementation', async () => {
    expect(await runMockedChecks(apis, loadFake)).toEqual(allAs('noop'));
  });

  // A plain Node process, because module hooks do not apply inside the test worker.
  it('reports implemented under Node', () => {
    const script = `
      import { mockedChecks, runMockedChecks } from ${JSON.stringify(pathToFileURL(path.join(import.meta.dirname, '../../scripts/probe/mocked-checks.mjs')).href)};
      console.log(JSON.stringify(await runMockedChecks(Object.keys(mockedChecks))));
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });
    expect(JSON.parse(output.trim().split('\n').at(-1) ?? '')).toEqual(allAs('implemented'));
  });
});
