import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const code = 'api Function(string)';

describe('code built from a string with the Function constructor', () => {
  it('records new Function(...) and Function(...) with code in an argument', () => {
    expect(usagesOf("new Function('return 1');")).toEqual([code]);
    expect(usagesOf("Function('a', 'return a')();")).toEqual([code]);
    expect(usagesOf('const body = getBody(); new Function(body);')).toEqual([code]);
  });

  it('records it through the global object', () => {
    expect(usagesOf("globalThis.Function('x');")).toContain(code);
  });

  it('leaves the global object idiom alone, since code using it checks for globalThis first', () => {
    expect(usagesOf("const root = Function('return this')();")).toEqual([]);
    expect(usagesOf("new Function('return this;')();")).toEqual([]);
  });

  it('leaves alone what is not a call with code', () => {
    expect(usagesOf('new Function();')).toEqual([]);
    expect(usagesOf('x instanceof Function; typeof Function; Function.prototype.call;')).toEqual(
      [],
    );
    expect(usagesOf("const Function = () => {}; Function('x');")).toEqual([]);
  });
});
