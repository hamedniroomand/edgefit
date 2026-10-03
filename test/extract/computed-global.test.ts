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
});
