import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vite-plus/test';

import { globalsOf, usagesOf } from '~/helpers.ts';

const deno = 'globalThis.Deno';
const fs = "import fs from 'node:fs';\n";

/** The form that esbuild writes for a target older than ES2020. */
const esbuild = (source: string, minify = false): string =>
  transformSync(source, { target: 'es2019', minify }).code;

/** The form that TypeScript and Babel write for `value?.use`, with `use` on the temp `_a`. */
const chainTo = (value: string, use: string): string =>
  `(_a = ${value}) === null || _a === void 0 ? void 0 : ${use}`;

const chain = (value: string, use: string): string => chainTo(value, `_a${use}`);

/** The form that TypeScript writes for `value ?? fallback`. */
const nullish = (value: string, fallback: string): string =>
  `(_a = ${value}) !== null && _a !== void 0 ? _a : ${fallback}`;

/**
 * Each case: the source form and the TypeScript form. The esbuild form comes from esbuild. The
 * result of each is the result of its source form, also for `new`, a destructuring, a spread and a
 * `for … of` of the chain, which follow the source form when it changes.
 */
const cases: [string, string][] = [
  [`const v = ${deno}?.cwd;`, `const v = ${chain(deno, '.cwd')};`],
  [`(${deno}?.env).get('X');`, `(${chain(deno, '.env')}).get('X');`],
  [`(${deno}?.cwd)();`, `(${chain(deno, '.cwd')}).call(_a);`],
  [`(${deno}?.env.get)();`, `(${chainTo(deno, '(_b = _a.env).get')}).call(_b);`],
  [`(${deno}?.env.get)('X');`, `(${chainTo(deno, '(_b = _a.env).get')}).call(_b, 'X');`],
  [`new (${deno}?.Command)();`, `new (${chain(deno, '.Command')})();`],
  [`const { a } = ${deno}?.env;`, `const { a } = ${chain(deno, '.env')};`],
  [`let a;\n({ a } = ${deno}?.env);`, `let a;\n({ a } = ${chain(deno, '.env')});`],
  [
    `async function g() {\n  (await (${deno}?.env)).x;\n}`,
    `async function g() {\n  (await (${chain(deno, '.env')})).x;\n}`,
  ],
  [`[...(${deno}?.args)];`, `[...(${chain(deno, '.args')})];`],
  [`for (const x of ${deno}?.args) f(x);`, `for (const x of ${chain(deno, '.args')}) f(x);`],
  [`const v = ${deno}?.env;\nv.get('X');`, `const v = ${chain(deno, '.env')};\nv.get('X');`],
  [`(${deno}?.env)?.x;`, `(${chain(deno, '.env')})?.x;`],
  [`${deno}?.env?.x;`, `(_b = ${chain(deno, '.env')}) === null || _b === void 0 ? void 0 : _b.x;`],
  [
    `${deno}?.env?.get?.('X');`,
    `(_c = (_b = ${chain(deno, '.env')}) === null || _b === void 0 ? void 0 : _b.get) === null || _c === void 0 ? void 0 : _c.call(_b, 'X');`,
  ],
  [
    `${deno}?.env?.x.y();`,
    `(_b = ${chain(deno, '.env')}) === null || _b === void 0 ? void 0 : _b.x.y();`,
  ],
  [`${deno}?.env.get('X');`, `${chain(deno, ".env.get('X')")};`],
  [`if (${deno}?.cwd()) f();`, `if (${chain(deno, '.cwd()')}) f();`],
  [`const k = 'cwd';\n${deno}?.[k];`, `const k = 'cwd';\n${chain(deno, '[k]')};`],
  [`${deno}?.();`, `${chain(deno, '.call(globalThis)')};`],
  [
    `${deno}.cwd?.();`,
    `(_b = (_a = ${deno}).cwd) === null || _b === void 0 ? void 0 : _b.call(_a);`,
  ],
  [
    `${deno}?.cwd?.();`,
    `(_b = ${chain(deno, '.cwd')}) === null || _b === void 0 ? void 0 : _b.call(_a);`,
  ],
  [`const { env } = ${deno} ?? {};`, `const { env } = ${nullish(deno, '{}')};`],
  [`(${deno} ?? {}).env;`, `(${nullish(deno, '{}')}).env;`],
  [`(${deno} ?? y)();`, `(${nullish(deno, 'y')})();`],
  [
    `const v = ${deno}?.cwd ?? z;`,
    `const v = (_b = ${chain(deno, '.cwd')}) !== null && _b !== void 0 ? _b : z;`,
  ],
  [
    `const v = ${deno}?.cwd;\nconst w = ${deno}?.args;`,
    `const v = ${chain(deno, '.cwd')};\nconst w = ${chain(deno, '.args')};`,
  ],
  [
    `const v = ${deno}?.env.toObject() || {};`,
    `const v = (${chain(deno, '.env.toObject()')}) || {};`,
  ],
  [
    `const v = ${deno}?.env.toObject() ?? {};`,
    `const v = (_b = ${chain(deno, '.env.toObject()')}) !== null && _b !== void 0 ? _b : {};`,
  ],
  [
    `const v = typeof ${deno}?.env.toObject();`,
    `const v = typeof (${chain(deno, '.env.toObject()')});`,
  ],
  [`const v = !${deno}?.env.toObject();`, `const v = !(${chain(deno, '.env.toObject()')});`],
  [`${deno}?.env.toObject().x;`, `${chain(deno, '.env.toObject().x')};`],
  [`${fs}fs?.watch;`, `${fs}${chain('fs', '.watch')};`],
  [`${fs}fs.promises?.watch;`, `${fs}${chain('fs.promises', '.watch')};`],
  [
    `${fs}fs.watch?.('.');`,
    `${fs}(_b = (_a = fs).watch) === null || _b === void 0 ? void 0 : _b.call(_a, '.');`,
  ],
  [`${fs}fs.promises?.watch('.');`, `${fs}${chain('fs.promises', ".watch('.')")};`],
];

describe('a compiled optional chain or nullish fallback', () => {
  it.each(cases)('gives the result of its source form, as esbuild writes it: %s', source => {
    const compiled = esbuild(source);
    expect(compiled).toMatch(/[!=]= null \?/u);
    expect(compiled).not.toMatch(/\?[.?]/u);
    expect(usagesOf(compiled)).toEqual(usagesOf(source));
    expect(globalsOf(compiled)).toEqual(globalsOf(source));
  });

  it.each(cases)('gives the result of its source form, as esbuild minifies it: %s', source => {
    const compiled = esbuild(source, true);
    expect(compiled).toMatch(/[!=]=null[?&|]/u);
    expect(compiled).not.toMatch(/\?[.?]/u);
    expect(usagesOf(compiled)).toEqual(usagesOf(source));
    expect(globalsOf(compiled)).toEqual(globalsOf(source));
  });

  it.each(cases)(
    'gives the result of its source form, as TypeScript writes it: %s',
    (source, typescript) => {
      const compiled = `var _a, _b, _c;\n${typescript}`;
      expect(usagesOf(compiled)).toEqual(usagesOf(source));
      expect(globalsOf(compiled)).toEqual(globalsOf(source));
    },
  );

  it('reads the minified test of esbuild as the source test', () => {
    const source = `if (${deno}?.cwd()) f();`;
    const compiled = esbuild(source, true);
    expect(compiled).toContain('!=null&&');
    expect(usagesOf(compiled)).toEqual(usagesOf(`${deno}?.cwd() && f();`));
    expect(usagesOf(`if ((_a = ${deno}) != null && _a.cwd()) f();`)).toEqual(usagesOf(source));
    expect(usagesOf(`if ((_a = ${deno}) !== null && _a !== void 0 && _a.cwd()) f();`)).toEqual(
      usagesOf(source),
    );
  });

  it('accepts the operands and the nullish values in any order', () => {
    const expected = usagesOf(`const v = ${deno}?.cwd;`);
    expect(usagesOf(`const v = null == (_a = ${deno}) ? void 0 : _a.cwd;`)).toEqual(expected);
    expect(
      usagesOf(`const v = (_a = ${deno}) === void 0 || _a === null ? void 0 : _a.cwd;`),
    ).toEqual(expected);
    expect(usagesOf(`const v = (_a = ${deno}) != null ? _a.cwd : void 0;`)).toEqual(expected);
    expect(usagesOf(`const v = (_a = ${deno}) == null ? y : _a;`)).toEqual(
      usagesOf(`const v = ${deno} ?? y;`),
    );
  });
});

describe('a compare of a temp that is not a compiled chain', () => {
  const plainRead = ['api Deno'];

  it('keeps the read of the value', () => {
    expect(usagesOf(`let last;\n(_a = ${deno}) !== last;`)).toEqual(plainRead);
    expect(usagesOf(`(_a = ${deno}) === null ? void 0 : _a.cwd;`)).toEqual(plainRead);
    expect(usagesOf(`(_a = ${deno}) === null || _a === null ? void 0 : _a.cwd;`)).toEqual(
      plainRead,
    );
    expect(usagesOf(`(_a = ${deno}) === null || _b === void 0 ? void 0 : _a.cwd;`)).toEqual(
      plainRead,
    );
    expect(usagesOf(`(_a = ${deno}) == null ? null : _a.cwd;`)).toEqual(plainRead);
    expect(usagesOf(`(_a = ${deno}) == null ? undefined : _a.cwd;`)).toEqual(plainRead);
    expect(usagesOf(`(_a = ${deno}) == null ? void f() : _a.cwd;`)).toEqual(plainRead);
    expect(usagesOf(`(_a = ${deno}) === null || _a === undefined ? void 0 : _a.cwd;`)).toEqual(
      plainRead,
    );
    expect(usagesOf(`(_a = ${deno}) == null ? void 0 : f(_a);`)).toEqual(plainRead);
    expect(usagesOf(`(o._a = ${deno}) == null ? void 0 : o._a.cwd;`)).toEqual(plainRead);
    expect(
      usagesOf(
        `function g() {\n  if ((_a = ${deno}) == null) log();\n  return _a.env.get('X');\n}`,
      ),
    ).toEqual(plainRead);
  });

  it('keeps a read of the temp after an if that is not the form', () => {
    expect(usagesOf(`let _a;\nif ((_a = ${deno}) == null) log();\n_a.env.get('X');`)).toEqual([
      'api Deno',
      'api Deno.env.get',
    ]);
  });

  it('keeps a call with another this argument as a call of the member', () => {
    expect(usagesOf(`(_a = ${deno}) == null ? void 0 : _a.call(other);`)).toEqual(
      usagesOf(`${deno}?.call(other);`),
    );
  });

  it('keeps a read of the temp after the form', () => {
    const source = `let _a;\n(_a = ${deno}) == null ? void 0 : _a.y;\n_a.cwd();`;
    expect(usagesOf(source)).toEqual(['api Deno.cwd']);
  });
});

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
  ['a void', `var _a;\nvoid (${orStatement});`],
  ['a for update', `var _a;\nfor (;; ${orStatement}) break;`],
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
