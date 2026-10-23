import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vite-plus/test';

import { globalsOf } from '~/helpers.ts';

const names = new Set(['process', 'global', 'globalThis', 'self', 'Deno']);

const call = "globalThis.Deno?.core.print('x')";
/** The form that TypeScript writes for `call`, with the temp `_a`. */
const compiledCall =
  "((_a = globalThis.Deno) === null || _a === void 0 ? void 0 : _a.core.print('x'))";

type Place = (value: string) => string;

/** A place where nothing reads the value of the chain. */
const droppedPlaces: [string, Place][] = [
  ['an item of a list joined with commas', value => `export function f() { g(), ${value}, h(); }`],
  [
    'the last item of a list that is a statement',
    value => `export function f() { g(), ${value}; }`,
  ],
  ['an item of a list in a return', value => `export function f() { return ${value}, 1; }`],
  ['the right side of `&&`', value => `export function f(n) { n && ${value}; }`],
  ['the right side of `||`', value => `export function f(n) { n || ${value}; }`],
  ['a branch of `?:`', value => `export function f(n) { n ? ${value} : g(); }`],
  ['the body of an `if`', value => `export function f(n) { if (n) ${value}; }`],
  [
    'a branch inside the right side of `&&`',
    value => `export function f(n, m) { n && (m ? ${value} : g()); }`,
  ],
];

/** A place where something reads the value of the chain. */
const readPlaces: [string, Place][] = [
  ['the last item of a list in a return', value => `export function f() { return g(), ${value}; }`],
  ['the last item of a list in an arrow body', value => `export const f = () => (g(), ${value});`],
  [
    'the right side of `&&` that is returned',
    value => `export function f(n) { return n && ${value}; }`,
  ],
  [
    'the right side of `||` that is passed to a call',
    value => `export function f(n) { g(n || ${value}); }`,
  ],
  [
    'a branch of `?:` that is assigned',
    value => `export function f(n) { const v = n ? ${value} : 1; return v; }`,
  ],
  ['an item of a list in an argument', value => `export function f() { g((h(), ${value})); }`],
];

describe('a `?.` chain where nothing reads the value', () => {
  it.each(droppedPlaces)('guards the use in %s', (_label, place) => {
    expect(globalsOf(place(call), names)).toEqual(['Deno.core.print [has Deno]']);
  });

  it.each(droppedPlaces)('guards the use in %s, as TypeScript writes it', (_label, place) => {
    expect(globalsOf(`var _a;\n${place(compiledCall)}`, names)).toEqual([
      'Deno.core.print [has Deno]',
    ]);
  });

  it.each(
    droppedPlaces.flatMap(([label, place]) =>
      [false, true].map(minify => [label, minify, place] as const),
    ),
  )('guards the use in %s, as esbuild writes it, minify: %s', (_label, minify, place) => {
    const code = transformSync(place(call), { target: 'es2019', minify, loader: 'js' }).code;
    expect(globalsOf(code, names)).toEqual(['Deno.core.print [has Deno]']);
  });

  it('guards the use in the right side of `??`, as TypeScript and esbuild write it without minify', () => {
    const place: Place = value => `export function f(n) { n ?? ${value}; }`;
    const expected = ['Deno.core.print [has Deno]'];
    expect(globalsOf(place(call), names)).toEqual(expected);
    expect(globalsOf(`var _a;\n${place(compiledCall)}`, names)).toEqual(expected);
    const code = transformSync(place(call), { target: 'es2019', loader: 'js' }).code;
    expect(globalsOf(code, names)).toEqual(expected);
  });

  it.each([
    ['a statement', `await ${call};`],
    ['the right side of `&&`', `n && await ${call};`],
  ])('guards the use of an awaited call in %s', (_label, statement) => {
    const code = `export async function f(n) { ${statement} }`;
    expect(globalsOf(code, names)).toEqual(['Deno.core.print [has Deno]']);
  });
});

describe('a `?.` chain whose value is read', () => {
  it.each(readPlaces)('does not guard the use in %s', (_label, place) => {
    const usages = globalsOf(place(call), names);
    expect(usages).toEqual(['Deno.core.print']);
    expect(globalsOf(`var _a;\n${place(compiledCall)}`, names)).toEqual(usages);
  });

  it.each(['const v = await', 'return await'])(
    'does not guard an awaited call after `%s`',
    head => {
      const code = `export async function f() { ${head} ${call}; }`;
      expect(globalsOf(code, names)).toEqual(['Deno.core.print']);
    },
  );
});
