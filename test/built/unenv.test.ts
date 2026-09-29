import { describe, expect, it } from 'vite-plus/test';

import { unenvUsage } from '@/built/unenv.ts';

function displayOf(file: string): string | undefined {
  return unenvUsage(file)?.display;
}

describe('unenvUsage', () => {
  it.each([
    ['node_modules/unenv/dist/runtime/node/internal/fs/fs.mjs', 'node:fs'],
    ['node_modules/unenv/dist/runtime/node/internal/fs/promises.mjs', 'node:fs/promises'],
    ['node_modules/unenv/dist/runtime/node/internal/http/request.mjs', 'node:http'],
    ['node_modules/unenv/dist/runtime/node/timers.mjs', 'node:timers'],
    ['node_modules/unenv/runtime/node/fs/_fs.mjs', 'node:fs'],
    ['node_modules/unenv/runtime/node/fs/promises/index.mjs', 'node:fs/promises'],
    ['node_modules/unenv/dist/runtime/mock/proxy.mjs', 'unenv/mock/proxy'],
  ])('reports %s as mocked %s', (file, display) => {
    expect(unenvUsage(file)).toMatchObject({ kind: 'mocked', display, location: { file } });
  });

  it.each([
    'node_modules/unenv/dist/runtime/polyfill/process.mjs',
    'node_modules/unenv/dist/runtime/_internal/utils.mjs',
    'node_modules/nitropack/dist/presets/_unenv/workerd/process.mjs',
    'src/runtime/node/fs.mjs',
  ])('ignores %s', file => {
    expect(displayOf(file)).toBeUndefined();
  });
});
