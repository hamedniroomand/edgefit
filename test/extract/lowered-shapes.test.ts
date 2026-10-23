import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vite-plus/test';

import { globalsOf, usagesOf } from '~/helpers.ts';

const names = new Set(['globalThis', 'Deno']);
const deno = 'globalThis.Deno';
const call = `${deno}?.core.print('x')`;

/** The form that esbuild writes for a target older than ES2020. */
const esbuild = (source: string, minify: boolean): string =>
  transformSync(source, { target: 'es2019', minify, loader: 'js' }).code;

/** The usages and the global conditions of a snippet. */
const resultOf = (code: string): [string[], string[]] => [
  usagesOf(code, undefined, names),
  globalsOf(code, names),
];

/** Each source with the esbuild forms (plain and minified) that must give its result. */
function itGivesTheSourceResult(sources: [string, string][]): void {
  it.each(
    sources.flatMap(([label, source]) =>
      [false, true].map(minify => [label, source, minify] as const),
    ),
  )(
    'gives the result of its source form for %s, as esbuild writes it, minify: %s',
    (_label, source, minify) => {
      expect(resultOf(esbuild(source, minify))).toEqual(resultOf(source));
    },
  );
}

describe('a chain that goes on behind a call', () => {
  const sources: [string, string][] = [
    ['a `?.` link after a call in a statement', `${call}?.then(f);`],
    ['two links after a call', `${call}?.then(f)?.catch(h);`],
    ['a `?.` link after a call in a test', `if (${call}?.then(f)) g();`],
    ['a `?.` call of a member', `${deno}?.core.print?.('x');`],
    ['a `?.` link after a call that is assigned', `const v = ${call}?.then(f);`],
    ['a `?.` call of a member that is assigned', `const v = ${deno}?.core.print?.('x');`],
  ];
  itGivesTheSourceResult(sources);

  it('gives the result of its source form, as TypeScript writes it', () => {
    const then = `(_b = (_a = ${deno}) === null || _a === void 0 ? void 0 : _a.core.print('x')) === null || _b === void 0 ? void 0 : _b.then(f);`;
    const member = `(_c = (_a = ${deno}) === null || _a === void 0 ? void 0 : (_b = _a.core).print) === null || _c === void 0 ? void 0 : _c.call(_b, 'x');`;
    expect(resultOf(`var _a, _b, _c;\n${then}`)).toEqual(resultOf(`${call}?.then(f);`));
    expect(resultOf(`var _a, _b, _c;\n${member}`)).toEqual(resultOf(`${deno}?.core.print?.('x');`));
  });

  it('guards the use of a chain that goes on behind a call', () => {
    expect(globalsOf(esbuild(`${call}?.then(f);`, true), names)).toEqual([
      'Deno.core.print [has Deno]',
    ]);
    expect(globalsOf(esbuild(`const v = ${call}?.then(f);`, true), names)).toEqual([
      'Deno.core.print',
    ]);
  });
});

describe('a chain that parentheses end', () => {
  itGivesTheSourceResult([
    ['a member of a parenthesized chain', `(${deno}?.core).print?.('x');`],
    ['a member of a parenthesized call', `(${call}).then?.(f);`],
  ]);
});

describe('a statement that a minifier writes for `V ?? y`', () => {
  itGivesTheSourceResult([
    ['a chain before `??` in a statement', `${call} ?? y();`],
    ['a chain before `??` in a declaration', `const v = ${call} ?? y();`],
  ]);

  it('reads `(t = V) != null || y()` as `V ?? y()` where the value is dropped', () => {
    const source = `${deno}?.core ?? y();`;
    expect(resultOf(`var _a;\n(_a = ${deno}?.core) != null || y();`)).toEqual(resultOf(source));
    expect(resultOf(`var _a;\n(_a = ${deno}?.core) !== null && _a !== void 0 || y();`)).toEqual(
      resultOf(source),
    );
  });

  it('keeps the read where the value is used or the fallback reads the temp', () => {
    const read = ['api Deno', 'api Deno.core.print'];
    expect(usagesOf(`var _a;\nconst v = (_a = ${deno}) != null || y();`, undefined, names)).toEqual(
      ['api Deno'],
    );
    expect(
      usagesOf(`var _a;\n(_a = ${deno}) != null || _a.core.print('x');`, undefined, names),
    ).toEqual(read);
  });
});

describe('the compiled form of `delete V?.y`', () => {
  itGivesTheSourceResult([
    ['a statement', `delete ${deno}?.core;`],
    ['a declaration', `const v = delete ${deno}?.core;`],
    ['a statement after `&&`', `function f(n) { n && delete ${deno}?.core; }`],
  ]);

  it('reads the forms with `true` and with `||` as `delete (t = V)?.y`', () => {
    const source = `delete ${deno}?.core;`;
    expect(resultOf(`var _a;\n(_a = ${deno}) == null ? true : delete _a.core;`)).toEqual(
      resultOf(source),
    );
    expect(resultOf(`var _a;\n(_a = ${deno}) == null ? !0 : delete _a.core;`)).toEqual(
      resultOf(source),
    );
    expect(resultOf(`var _a;\n(_a = ${deno}) != null ? delete _a.core : true;`)).toEqual(
      resultOf(source),
    );
    expect(resultOf(`var _a;\n(_a = ${deno}) == null || delete _a.core;`)).toEqual(
      resultOf(source),
    );
    expect(
      resultOf(`var _a;\n(_a = ${deno}) === null || _a === void 0 ? true : delete _a.core;`),
    ).toEqual(resultOf(source));
  });

  it('keeps the read when the value is not `true` or the delete is not of the temp', () => {
    const read = ['api Deno', 'api Deno.core'];
    expect(
      usagesOf(`var _a;\n(_a = ${deno}) == null ? false : delete _a.core;`, undefined, names),
    ).toEqual(read);
    expect(
      usagesOf(`var _a;\n(_a = ${deno}) == null ? void 0 : delete _a.core;`, undefined, names),
    ).toEqual(read);
    expect(
      usagesOf(`var _a;\n(_a = ${deno}) == null ? true : delete other.core;`, undefined, names),
    ).toEqual(['api Deno']);
    expect(
      usagesOf(`var _a;\n(_a = ${deno}) == null || delete other.core;`, undefined, names),
    ).toEqual(['api Deno']);
    const typeofCore = `var _a;\n(_a = ${deno}) == null || typeof _a.core;`;
    expect(usagesOf(typeofCore, undefined, names)).toContain('api Deno');
    const typeofIf = `var _a;\n(_a = ${deno}) == null ? true : typeof _a.core;`;
    expect(usagesOf(typeofIf, undefined, names)).toContain('api Deno');
  });
});

describe('the flat `||` that a minifier writes after a test', () => {
  itGivesTheSourceResult([
    ['a chain after `??` in a statement', `function f(n) { n ?? ${call}; }`],
    ['a chain after two `??` in a statement', `function f(n, m) { n ?? m ?? ${call}; }`],
  ]);

  it('reads `a || (t = V) == null || t.y` as `a || (t = V)?.y` where the value is dropped', () => {
    const source = `function f(n) { n || ${call}; }`;
    expect(
      resultOf(`var _a;\nfunction f(n) { n || (_a = ${deno}) == null || _a.core.print('x'); }`),
    ).toEqual(resultOf(source));
    expect(
      resultOf(
        `var _a;\nfunction f(n, m) { n || m || (_a = ${deno}) == null || _a.core.print('x'); }`,
      ),
    ).toEqual(resultOf(`function f(n, m) { n || m || ${call}; }`));
  });

  it('keeps the read where the value is used', () => {
    const read = ['api Deno', 'api Deno.core.print'];
    const code = `var _a;\nfunction f(n) { return n || (_a = ${deno}) == null || _a.core.print('x'); }`;
    expect(usagesOf(code, undefined, names)).toEqual(read);
    const used = `var _a;\nfunction f(n, m) { if (n || (_a = ${deno}) == null || _a.core.print('x')) m(); }`;
    expect(usagesOf(used, undefined, names)).toEqual(read);
  });
});
