import { describe, expect, it } from 'vite-plus/test';

import { globalsOf, usagesOf } from '~/helpers.ts';

const deno = 'globalThis.Deno';

const orStatement = `(_a = ${deno}) == null || _a.core.print('x')`;
const sourceStatement = `${deno}?.core.print('x')`;
const globals = new Set(['globalThis', 'Deno']);

/** The places where the program drops the value of a statement, each with the statement in it. */
const droppedPlaces: [string, (statement: string) => string][] = [
  ['a statement', statement => `${statement};`],
  ['a type wrapper', statement => `(${statement}) as unknown;`],
  ['a list joined with commas', statement => `f(), ${statement}, g();`],
  ['the last item of a list joined with commas', statement => `f(), ${statement};`],
  ['the right side of &&', statement => `n && (${statement});`],
  ['the right side of ||', statement => `n || (${statement});`],
  ['the right side of ??', statement => `n ?? (${statement});`],
  ['a branch of ?:', statement => `n ? ${statement} : g();`],
  [
    'a list joined with commas in a return',
    statement => `function f() {\n  return ${statement}, 1;\n}`,
  ],
  ['a void', statement => `void (${statement});`],
  ['a for init', statement => `for (${statement}; ; ) break;`],
  ['a for update', statement => `for (; ; ${statement}) break;`],
  ['a statement of a function body', statement => `const f = () => {\n  ${statement};\n};`],
  ['an await', statement => `async function f() {\n  await (${statement});\n}`],
];

/** Other compares that a compiler writes, in the place of a statement. */
const orTests: [string, string][] = [
  ['a loose compare with null first', `null == (_a = ${deno}) || _a.core.print('x')`],
  ['a strict pair', `(_a = ${deno}) === null || _a === void 0 || _a.core.print('x')`],
  [
    'a strict pair with the nullish values first',
    `null === (_a = ${deno}) || void 0 === _a || _a.core.print('x')`,
  ],
];

/** A form that uses the value of the `||`, which is `true` when `Deno` is missing. */
const usedForms: [string, string][] = [
  ['an assignment', `var _a, v;\nv = ${orStatement};`],
  ['a declaration', `var _a;\nconst v = ${orStatement};`],
  ['a return', `var _a;\nfunction f() {\n  return ${orStatement};\n}`],
  ['a throw', `var _a;\nfunction f() {\n  throw ${orStatement};\n}`],
  ['the body of an arrow function', `var _a;\nconst f = () => ${orStatement};`],
  [
    'the last item of a list in a return',
    `var _a;\nfunction f() {\n  return g(), ${orStatement};\n}`,
  ],
  ['the last item of a list in an arrow body', `var _a;\nconst f = () => (g(), ${orStatement});`],
  ['an argument', `var _a;\ng(${orStatement});`],
  ['the test of an if', `var _a;\nif (${orStatement}) g();`],
  ['the test of ?:', `var _a;\n(${orStatement}) ? g() : h();`],
  ['a branch of ?: that is assigned', `var _a, v;\nv = n ? ${orStatement} : g();`],
  ['the left side of &&', `var _a;\n(${orStatement}) && g();`],
  ['the left side of ||', `var _a;\n(${orStatement}) || g();`],
  ['a call', `var _a;\n((_a = ${deno}) == null || _a.cwd)();`],
  ['a for test', `var _a;\nfor (; ${orStatement}; ) break;`],
  [
    'a compare that lets a missing value through',
    `var _a;\n(_a = ${deno}) != null || _a.core.print('x');`,
  ],
  ['a strict compare alone', `var _a;\n(_a = ${deno}) === null || _a.core.print('x');`],
  [
    'a strict compare with undefined alone',
    `var _a;\n(_a = ${deno}) === void 0 || _a.core.print('x');`,
  ],
  ['a test that is the opposite', `var _a;\n(_a = ${deno}) == null && _a.core.print('x');`],
];

describe('the minified or form of a compiled optional chain', () => {
  it('guards the statement on a target that lacks the global', () => {
    const expected = ['Deno.core.print [has Deno]'];
    expect(globalsOf(`${sourceStatement};`, globals)).toEqual(expected);
    expect(globalsOf(`var _a;\n${orStatement};`, globals)).toEqual(expected);
  });

  it('keeps a read of the temp after the form', () => {
    expect(usagesOf(`let _a;\n${orStatement};\n_a.cwd();`)).toEqual([
      'api Deno.core.print',
      'api Deno.cwd',
    ]);
  });

  it.each(droppedPlaces)('gives the result of its source form in %s', (_name, place) => {
    const compiled = `var _a;\n${place(orStatement)}`;
    expect(usagesOf(compiled, undefined, globals)).toEqual(
      usagesOf(place(sourceStatement), undefined, globals),
    );
    expect(globalsOf(compiled, globals)).toEqual(globalsOf(place(sourceStatement), globals));
  });

  it.each(orTests)('gives the result of its source form for %s', (_name, test) => {
    const compiled = `var _a;\n${test};`;
    expect(usagesOf(compiled)).toEqual(usagesOf(`${sourceStatement};`));
    expect(globalsOf(compiled, globals)).toEqual(globalsOf(`${sourceStatement};`, globals));
  });

  it.each(usedForms)('keeps the read of the value for %s', (_name, form) => {
    expect(usagesOf(form)).toContain('api Deno');
  });

  it('keeps a hand-written check on a plain name', () => {
    expect(usagesOf(`let x = ${deno};\nx == null || x.core.print('x');`)).toEqual([
      'api Deno',
      'api Deno.core.print [guarded]',
    ]);
  });
});
