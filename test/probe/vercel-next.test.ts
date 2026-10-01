import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  compareMembers,
  compareNext,
  compareSources,
  hasStandIn,
  parseNativeModuleMap,
  parseSupportedModules,
} from '@scripts/probe/vercel/next.mjs';
import { describe, expect, it } from 'vite-plus/test';

const allowlist = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '../../data/allowlists/vercel-edge.json'), 'utf8'),
) as { modules: Record<string, string[]> };

// The lines of next 16.3.8's dist/build/webpack/plugins/middleware-plugin.js that matter here.
const pluginSource = `const SUPPORTED_NATIVE_MODULES = [
    'buffer',
    'events',
    'assert',
    'util',
    'async_hooks'
];
return \`root globalThis.__import_unsupported('\${request}')\`;`;

describe('Next.js edge build as a witness', () => {
  const modules = Object.keys(allowlist.modules);

  it('reads the modules Next keeps, and whether it stubs out the rest', () => {
    expect(parseSupportedModules(pluginSource)).toEqual([
      'buffer',
      'events',
      'assert',
      'util',
      'async_hooks',
    ]);
    expect(hasStandIn(pluginSource)).toBe(true);
    expect(parseSupportedModules('export const other = 1;')).toBeUndefined();
    expect(hasStandIn('nothing here')).toBe(false);
  });

  it('agrees with the data as it is', () => {
    const supported = parseSupportedModules(pluginSource) ?? [];
    expect(compareNext({ supported, standIn: true }, modules)).toEqual([]);
  });

  it('reports a module Next keeps that the data lacks, and one it dropped', () => {
    const result = compareNext(
      { supported: ['buffer', 'events', 'assert', 'util', 'path'], standIn: true },
      modules,
    );
    expect(result.map(section => section.items)).toEqual([['path'], ['async_hooks']]);
  });

  it('reports the loss of the stand-in, since vercel-edge relies on it', () => {
    const result = compareNext({ supported: modules, standIn: false }, modules);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toContain('no longer replaces unsupported Node.js modules');
  });
});

// NativeModuleMap as next 16.3.8 (dist/server/web/sandbox/context.js) and @vercel/node 16.0.2
// (dist/dev-server.mjs) write it, cut to two modules.
const nextSandbox = `const mods = {
        'node:buffer': (0, _pick.pick)(_nodebuffer.default, [
            'constants',
            'kMaxLength',
            'Buffer',
            'SlowBuffer'
        ]),
        'node:util': (0, _pick.pick)(_nodeutil.default, [
            '_extend',
            'format',
            'inherits',
            'promisify'
        ])
    };`;
const vercelNodeMap = `const mods = {
    buffer: pick(BufferImplementation, [
      "constants",
      "kMaxLength",
      "Buffer",
      "SlowBuffer"
    ]),
    util: pick(UtilImplementation, [
      "_extend",
      "format",
      "inherits",
      "promisify"
    ])
  };`;

describe('member lists from Vercel’s own code', () => {
  const expected = {
    buffer: ['constants', 'kMaxLength', 'Buffer', 'SlowBuffer'],
    util: ['_extend', 'format', 'inherits', 'promisify'],
  };

  it('reads NativeModuleMap in both spellings', () => {
    expect(parseNativeModuleMap(nextSandbox)).toEqual(expected);
    expect(parseNativeModuleMap(vercelNodeMap)).toEqual(expected);
    expect(parseNativeModuleMap('export const other = 1;')).toBeUndefined();
  });

  it('finds the two sources in agreement, and notices when they stop agreeing', () => {
    expect(compareSources(expected, expected)).toEqual([]);
    const moved = { ...expected, util: ['format'] };
    expect(compareSources(expected, moved).map(section => section.items)).toEqual([['util']]);
  });

  it('agrees with the data in the repository for the modules in the snippet', () => {
    const modules = {
      buffer: allowlist.modules.buffer,
      util: allowlist.modules.util,
    } as Record<string, string[]>;
    const subset = compareMembers('next', expected, modules);
    // The snippet is cut short, so only what it lists can be missing from it.
    expect(subset.every(section => section.title.includes('that it does not expose'))).toBe(true);
  });

  it('would have caught the data as it was: everything allowed, and a short util list', () => {
    const before = compareMembers('next', expected, {
      buffer: true,
      util: ['callbackify', 'promisify', 'types'],
    });
    expect(before.map(section => section.title)).toEqual([
      'next: buffer exposes only some members, but the data allows all of them',
      'next: members of util it exposes that the data lacks',
      'next: members of util in the data that it does not expose',
    ]);
    expect(before[1]?.items).toEqual(['_extend', 'format', 'inherits']);
  });
});
