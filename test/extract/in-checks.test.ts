import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const name = 'const name = String(Date.now());\n';

describe('the right side of in', () => {
  it('is a use, because in throws when the right side is missing', () => {
    expect(usagesOf("'k' in process.binding;")).toEqual(['api node:process.binding']);
    expect(usagesOf("'k' in globalThis.Deno.env;")).toEqual(['api Deno.env']);
    expect(usagesOf("'k' in process['binding'];")).toEqual(['api node:process.binding']);
  });

  it('is only a check when it is the global object', () => {
    expect(usagesOf("'Deno' in globalThis;\n'k' in self;\n'k' in global;")).toEqual([]);
    expect(usagesOf("const g = globalThis;\n'k' in g;")).toEqual([]);
  });

  it('is a use after ?., because in throws for undefined', () => {
    expect(usagesOf("'k' in process?.binding;")).toEqual(['api node:process.binding']);
    expect(usagesOf("'k' in globalThis.process?.binding;")).toEqual(['api node:process.binding']);
  });

  // A computed read records its object too, except the global object, which is never recorded.
  it('is a use with a computed key', () => {
    expect(usagesOf(`${name}'k' in process[name];`)).toEqual([
      'api node:process',
      'dynamic node:process[<expression>]',
    ]);
    expect(usagesOf(`${name}'k' in globalThis[name];`)).toEqual([
      'dynamic globalThis[<expression>]',
    ]);
  });
});

describe('the checks around an in test', () => {
  it('still guard the member that in tests for', () => {
    expect(usagesOf("if ('k' in process.binding) process.binding.k();")).toEqual([
      'api node:process.binding',
      'api node:process.binding.k [guarded]',
    ]);
  });

  it('still guard the right side', () => {
    const guarded = ['api node:process.binding [guarded]'];
    expect(usagesOf("typeof process.binding !== 'undefined' && 'k' in process.binding;")).toEqual(
      guarded,
    );
    expect(usagesOf("process.binding && 'k' in process.binding;")).toEqual(guarded);
  });

  it('keep a right side with a fallback as a checked operand', () => {
    expect(usagesOf("'k' in (process.binding || {});")).toEqual([
      'api node:process.binding [guarded]',
    ]);
  });
});
