import type { Message } from 'esbuild';
import { describe, expect, it } from 'vite-plus/test';

import { acceptMissingRequires, lazyRequires } from '@/resolve/missing-requires.ts';
import { fixture } from '~/helpers.ts';

describe('lazy require locations', () => {
  it('finds each call in function declarations, arrows, and methods', () => {
    const source = `function a() { return require('driver'); }
const b = () => require('driver');
class C { load() { return require('@scope/driver/sub'); } }`;
    const loads = lazyRequires('a.js', source);
    expect(loads.get('driver')).toEqual([22, 59]);
    expect(loads.get('@scope/driver/sub')).toHaveLength(1);
  });

  it.each([
    "require('driver'); const load = () => require('driver');",
    "import 'driver'; const load = () => require('driver');",
    "const load = () => import('driver');",
    "const load = () => require('./driver');",
    "const load = () => require('/driver');",
    "const load = () => require('#driver');",
    "const load = () => require('node:driver');",
    'const load = () => require(name);',
    "const load = () => require('');",
    "export * from 'driver'; const load = () => require('driver');",
    "export { x } from 'driver'; const load = () => require('driver');",
    'function {',
  ])('does not accept %s', source => {
    expect(lazyRequires('a.js', source).size).toBe(0);
  });
});

describe('resolve errors for lazy require', () => {
  it('accepts each module once and ignores other errors', () => {
    const missing = {
      text: 'Could not resolve "edgefit-missing-driver"',
      location: { file: 'lazy.cjs' },
    } as Message;
    const messages = [missing, missing];
    const accepted = new Set<string>();
    const root = fixture('missing-require-app');
    expect(acceptMissingRequires(root, messages, accepted)).toBe(true);
    expect(accepted.size).toBe(1);
    expect(acceptMissingRequires(root, messages, accepted)).toBe(false);
    expect(
      acceptMissingRequires(
        root,
        [
          { text: 'Other error', location: null } as Message,
          { text: 'Could not resolve "driver"', location: null } as Message,
        ],
        accepted,
      ),
    ).toBe(false);
  });
});
