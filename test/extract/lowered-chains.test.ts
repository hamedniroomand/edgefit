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
