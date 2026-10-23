import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

describe('a computed read of the global object', () => {
  it.each(['===', '!==', '==', '!='])('is not unknown when it is only compared with `%s`', op => {
    expect(usagesOf(`export const f = (o, n) => globalThis[n] ${op} o.constructor;`)).toEqual([]);
    expect(usagesOf(`export const f = (o, n) => o.constructor ${op} self[n];`)).toEqual([]);
  });

  it('is not unknown when it is under `typeof` or an if test', () => {
    expect(usagesOf('export const f = n => typeof globalThis[n];')).toEqual([]);
    expect(usagesOf('export const f = n => { if (globalThis[n]) return 1; };')).toEqual([]);
  });

  it('is unknown when it is called, read further or passed on', () => {
    const unknown = ['dynamic globalThis[<expression>]'];
    expect(usagesOf('export const f = n => globalThis[n]();')).toEqual(unknown);
    expect(usagesOf('export const f = n => globalThis[n].y;')).toEqual(unknown);
    expect(usagesOf('export const f = n => use(globalThis[n]);')).toEqual(unknown);
  });

  it('is not unknown when it is written', () => {
    expect(usagesOf('export const f = (n, v) => { globalThis[n] = v; };')).toEqual([]);
    expect(usagesOf('export const f = (n, v) => { globalThis[n] ??= v; };')).toEqual([]);
    expect(usagesOf('export const f = (n, v) => { globalThis[n] ||= v; };')).toEqual([]);
  });

  it.each(['||', '??'])('is not unknown when it has a fallback with `%s`', op => {
    expect(usagesOf(`export const f = n => globalThis[n] ${op} Error;`)).toEqual([]);
  });

  it('is a guarded use of each key it may be when it has a fallback', () => {
    const source = "for (const k of ['Buffer', 'fetch']) { use(globalThis[k] || X); }";
    expect(usagesOf(`export const f = c => { ${source} };`)).toEqual([
      'api Buffer [guarded]',
      'api fetch [guarded]',
    ]);
  });

  it('is not a use of a key it may be when it is written', () => {
    const source = "for (const k of ['Buffer', 'fetch']) { globalThis[k] = v; }";
    expect(usagesOf(`export const f = (c, v) => { ${source} };`)).toEqual([]);
  });

  it('is unknown when it is the fallback value', () => {
    expect(usagesOf('export const f = n => Error || globalThis[n];')).toEqual([
      'dynamic globalThis[<expression>]',
    ]);
  });
});

describe('a computed read of the global object that is returned', () => {
  const unknown = ['dynamic globalThis[<expression>]'];

  it.each([
    [
      'in a try block',
      'export function f(n) {\n  try {\n    return globalThis[n];\n  } catch {}\n  return "";\n}',
    ],
    ['as the body of an arrow function', 'export const f = n => globalThis[n];'],
    [
      'through parentheses and a comma',
      'export function f(n) {\n  return (0, (globalThis[n]));\n}',
    ],
    ['for `self`', 'export const f = n => self[n];'],
    ['for `global`', 'export const f = n => global[n];'],
  ])('is not unknown %s', (_name, code) => {
    expect(usagesOf(code)).toEqual([]);
  });

  it.each([
    ['called', 'return globalThis[n]();'],
    ['read for a member', 'return globalThis[n].y;'],
    ['used with `new`', 'return new globalThis[n]();'],
    ['passed to a call', 'return use(globalThis[n]);'],
    ['awaited', 'return await globalThis[n];'],
    ['assigned to a name', 'const value = globalThis[n];\n  return value;'],
    ['in a branch of a condition', 'return c ? globalThis[n] : 1;'],
    ['in a template', 'return `${globalThis[n]}`;'],
  ])('is unknown when it is %s', (_name, body) => {
    expect(usagesOf(`export async function f(n, c) {\n  ${body}\n}`)).toEqual(unknown);
  });
});

describe('a computed read of the global object that is not a plain return', () => {
  const unknown = ['dynamic globalThis[<expression>]'];

  it('is unknown when it is the default value of a parameter that the function calls', () => {
    expect(usagesOf('export const f = (n, x = globalThis[n]) => x();')).toEqual(unknown);
    expect(usagesOf('export const f = (n, x = (globalThis[n])) => x();')).toEqual(unknown);
    expect(usagesOf('export const f = ({ x = globalThis[n] }, n) => x();')).toEqual(unknown);
  });

  it('is a use of each key it may be when the keys are known', () => {
    const source = "for (const k of ['document', 'window']) {\n    return globalThis[k];\n  }";
    expect(usagesOf(`export function f() {\n  ${source}\n}`)).toEqual([
      'api document',
      'api window',
    ]);
  });

  it('is unknown for a module that is not the global object', () => {
    const code = "import fs from 'node:fs';\nexport const f = n => fs[n];";
    expect(usagesOf(code)).toContain('dynamic node:fs[<expression>]');
  });
});
