import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

describe('a helper function that the file sets again', () => {
  const names = new Set(['globalThis', 'Deno']);
  const use = 'export function f() { if (isDeno()) globalThis.Deno.env; }';
  it.each([
    ['a return of the check', 'function isDeno() { return "Deno" in globalThis; }'],
    [
      'an if that returns true or false',
      'function isDeno() { if ("Deno" in globalThis) return true; return false; }',
    ],
  ])('is not followed for %s', (_label, helper) => {
    expect(usagesOf(`${helper}\n${use}`, 'src/input.ts', names)).toEqual([
      'api Deno.env [guarded] [deno]',
    ]);
    expect(usagesOf(`${helper}\nisDeno = () => true;\n${use}`, 'src/input.ts', names)).toEqual([
      'api Deno.env',
    ]);
    expect(
      usagesOf(`${helper}\nexport function set() { isDeno = 1; }\n${use}`, 'src/input.ts', names),
    ).toEqual(['api Deno.env']);
  });

  it('is followed when a nested function only declares its own name', () => {
    const helper = 'function isDeno() { return "Deno" in globalThis; }';
    expect(
      usagesOf(
        `${helper}\nfunction other() { let isDeno = 1; isDeno = 2; }\n${use}`,
        'src/input.ts',
        names,
      ),
    ).toEqual(['api Deno.env [guarded] [deno]']);
  });
});
