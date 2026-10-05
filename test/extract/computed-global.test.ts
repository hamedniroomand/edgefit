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
