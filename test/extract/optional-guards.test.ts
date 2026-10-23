import { describe, expect, it } from 'vite-plus/test';

import { collectFindings, defaultLevels } from '@/core/findings.ts';
import { extractUsages } from '@/extract/index.ts';
import { globalsOf, stubTarget, usagesOf } from '~/helpers.ts';

const names = new Set(['process', 'global', 'globalThis', 'self', 'Deno']);
const env = 'Deno.env.toObject [has Deno]';

describe('a `?.` link right after a property of the global object', () => {
  it.each([
    [
      'an operand of `||`',
      'export const e = u => globalThis.process?.env || globalThis.Deno?.env.toObject() || globalThis.__env__ || (u ? {} : globalThis);',
      env,
    ],
    ['an operand of `??`', 'export const e = () => globalThis.Deno?.env.toObject() ?? {};', env],
    [
      'a statement',
      "export function f() { globalThis.Deno?.core.print('x'); }",
      'Deno.core.print [has Deno]',
    ],
    ['a `typeof` operand', 'export const f = () => typeof globalThis.Deno?.env.toObject();', env],
    [
      'the test of an `if`',
      'export function f() { if (globalThis.Deno?.env.toObject()) { return 1; } return 0; }',
      env,
    ],
    ['a read in a statement', 'export function f() { globalThis.Deno?.env.toObject; }', env],
    ['a chain on `self`', 'export const e = () => self.Deno?.env.toObject() || {};', env],
    [
      'a chain with two links',
      'export const e = () => globalThis.Deno?.env?.toObject() || {};',
      env,
    ],
    [
      'a global in parentheses',
      'export const e = () => (globalThis.Deno)?.env.toObject() || {};',
      env,
    ],
  ])('guards the rest of its chain when the value is %s', (_label, code, expected) => {
    expect(globalsOf(code, names)).toContain(expected);
  });
});

describe('a `?.` chain that a wrapper or a compiler surrounds', () => {
  it.each([
    ['a call in parentheses', 'export const e = () => (globalThis.Deno?.env.toObject()) || {};'],
    [
      'a call with a type cast',
      'export const e = () => (globalThis.Deno?.env.toObject() as object) || {};',
    ],
    [
      'a call with a non-null assertion',
      'export const e = () => globalThis.Deno?.env.toObject()! || {};',
    ],
    ['a member read after the call', 'export function f() { globalThis.Deno?.env.toObject().x; }'],
    [
      'a compiled chain in `||`',
      'var _a;\nexport const e = () => ((_a = globalThis.Deno) == null ? void 0 : _a.env.toObject()) || {};',
    ],
    [
      'a compiled chain in `??`',
      'var _a, _b;\nexport const e = () => (_b = (_a = globalThis.Deno) == null ? void 0 : _a.env.toObject()) != null ? _b : {};',
    ],
    [
      'a compiled chain after `typeof`',
      'var _a;\nexport const e = () => typeof ((_a = globalThis.Deno) == null ? void 0 : _a.env.toObject());',
    ],
  ])('guards the rest of its chain for %s', (_label, code) => {
    expect(globalsOf(code, names)).toContain(env);
  });
});

describe('a `?.` link right after a global that does not guard its chain', () => {
  it.each([
    [
      'assigned to a name',
      'export function f() { const e = globalThis.Deno?.env.toObject(); return use(e); }',
    ],
    ['returned', 'export function f() { return globalThis.Deno?.env.toObject(); }'],
    ['passed to a call', 'export function f() { return use(globalThis.Deno?.env.toObject()); }'],
    ['used with `new`', "export function f() { return new (globalThis.Deno?.Command)('x'); }"],
    [
      'spread into an array',
      'export function f() { return [...globalThis.Deno?.env.toObject()]; }',
    ],
    [
      'awaited',
      'export async function f() { return (await globalThis.Deno?.env.toObject()) || {}; }',
    ],
    [
      'a read that is awaited',
      'export async function f() { return (await globalThis.Deno?.env.toObject) || {}; }',
    ],
    [
      'a read that is awaited in a statement',
      'export async function f() { await globalThis.Deno?.env.toObject; }',
    ],
    [
      'a read that is called behind parentheses',
      'export function f() { (globalThis.Deno?.env.toObject)(); }',
    ],
    [
      'read further behind parentheses',
      'export function f() { return (globalThis.Deno?.env.toObject()).x || {}; }',
    ],
    [
      'read behind a wrapper that ends the chain',
      'export function f() { return (globalThis.Deno?.env).toObject() || {}; }',
    ],
  ])('does not guard the chain when the value is %s', (_label, code) => {
    const usages = globalsOf(code, names);
    expect(usages).toContainEqual(expect.stringMatching(/^Deno\.[\w.]+$/u));
    expect(usages.join('\n')).not.toContain('has Deno');
  });
});

describe('a `?.` chain in `||` or `??` next to a nullish operand', () => {
  it.each([
    [
      '`??` and `null`',
      'export function f() { return (globalThis.Deno?.env.toObject() ?? null).x; }',
    ],
    [
      '`||` and `undefined`',
      'export function f() { return (globalThis.Deno?.env.toObject() || undefined).x; }',
    ],
  ])('does not guard the chain, because the value can be nullish, with %s', (_label, code) => {
    const usages = globalsOf(code, names);
    expect(usages).toContainEqual(expect.stringMatching(/^Deno\.[\w.]+$/u));
    expect(usages.join('\n')).not.toContain('has Deno');
  });
});

describe('a `?.` that does not follow a property of the global object', () => {
  it('does not guard a link that comes after the use of the global', () => {
    const code = 'export function f() { return globalThis.Deno.env?.toObject() || {}; }';
    const usages = globalsOf(code, names);
    expect(usages).toContainEqual(expect.stringMatching(/^Deno\.[\w.]+$/u));
    expect(usages.join('\n')).not.toContain('has Deno');
  });

  it('does not guard an alias of the global object', () => {
    const code =
      'const g = globalThis;\nexport function f() { return g.Deno?.env.toObject() || {}; }';
    const usages = globalsOf(code, names);
    expect(usages).toContainEqual(expect.stringMatching(/^Deno\.[\w.]+$/u));
    expect(usages.join('\n')).not.toContain('has Deno');
  });

  it('does not guard a bare name, because it throws a ReferenceError when it is not declared', () => {
    const code = 'export function f() { return Deno?.env.toObject() || {}; }';
    const usages = globalsOf(code, names);
    expect(usages).toContainEqual(expect.stringMatching(/^Deno\.[\w.]+$/u));
    expect(usages.join('\n')).not.toContain('has Deno');
  });

  it('does not guard a module, because its value is not always `undefined` when it is missing', () => {
    const code = "import fs from 'node:fs';\nexport function f() { return fs?.watch('.') || 0; }";
    expect(globalsOf(code, names)).toContain('node:fs.watch');
    expect(globalsOf(code, names).join('\n')).not.toContain('has ');
    expect(usagesOf(code).join('\n')).not.toContain('[guarded]');
  });
});

describe('the use after a `?.` link on a global, as a finding', () => {
  const source = 'export const e = () => globalThis.Deno?.env.toObject() || {};';
  const missing = { status: 'unsupported', absent: true } as const;
  const counts = (results: Parameters<typeof stubTarget>[0], globals: string[]): number[] => {
    const usages = extractUsages('src/input.ts', source, { globals: names, nodeEnv: 'production' });
    const module = { file: 'src/input.ts', package: undefined, chain: ['src/input.ts'], usages };
    const options = { target: stubTarget(results, [], globals), levels: defaultLevels, ignore: [] };
    const { findings, guarded } = collectFindings([module], options);
    return [findings.length, guarded.length];
  };

  it('is guarded on a target that lacks the global', () => {
    const results = { '*globals*.Deno': missing, '*globals*.Deno.env.toObject': missing };
    expect(counts(results, [])).toEqual([0, 1]);
  });

  it('is a finding on a target that has the global and lacks the API', () => {
    expect(counts({ '*globals*.Deno.env.toObject': missing }, ['Deno'])).toEqual([1, 0]);
  });
});
