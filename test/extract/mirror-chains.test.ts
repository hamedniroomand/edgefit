import { describe, expect, it } from 'vite-plus/test';

import { globalsOf, usagesOf } from '~/helpers.ts';

const names = new Set(['globalThis', 'Deno', 'process']);
const both = (code: string): string[] => [
  ...globalsOf(code, names),
  ...usagesOf(code, 'src/input.ts', names),
];

// No compiler writes `(t = V) != null ? t.y : void 0` for `V?.y`, but it means the same as the
// form TypeScript writes, `(t = V) === null || t === void 0 ? void 0 : t.y`, so it reads the same.
describe('a lowered chain with the present branch first', () => {
  it.each([
    ['a statement', 'X;'],
    ['a guard', 'if (X) h();'],
    ['a returned value', 'return X;'],
  ])('reads as the source form in %s', (_label, place) => {
    const source = place.replace('X', 'globalThis.Deno?.core.print()');
    const mirror = place.replace('X', '(_a = globalThis.Deno) != null ? _a.core.print() : void 0');
    const strict = place.replace(
      'X',
      '(_a = globalThis.Deno) !== null && _a !== void 0 ? _a.core.print() : void 0',
    );
    const wrap = (body: string): string => `var _a;\nexport function f() { ${body} }`;
    expect(both(wrap(mirror))).toEqual(both(wrap(source)));
    expect(both(wrap(strict))).toEqual(both(wrap(source)));
  });

  it('keeps the finding of a reused temp name, as the source form does', () => {
    const lowered = (value: string, use: string): string =>
      `(_a = ${value}) === null || _a === void 0 ? void 0 : _a${use};`;
    expect(
      usagesOf(
        `var _a;\nexport function f() { ${lowered('globalThis.process', '.dlopen()')} ${lowered('globalThis.process', ".binding('x')")} }`,
        'src/input.ts',
        names,
      ),
    ).toEqual(['api node:process.dlopen', 'api node:process.binding']);
  });
});
