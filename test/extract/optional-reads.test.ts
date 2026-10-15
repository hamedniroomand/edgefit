import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const v8 = "import v8 from 'node:v8';\n";

/** The code with `?.` (`#` becomes `?`) and the same code with `.` only. */
const forms = (code: string): [string, string] => [
  `${v8}${code.replace('#', '?')}`,
  `${v8}${code.replace('#', '')}`,
];

describe('a use of an optional read that throws for undefined', () => {
  it.each([
    ['new', 'new (v8.startupSnapshot#.X)();'],
    ['extends', 'class A extends (v8.startupSnapshot#.X) {}'],
    ['extends of a class expression', 'f(class extends (v8.startupSnapshot#.X) {});'],
    ['a tag', 'f((v8.startupSnapshot#.X)`t`);'],
    ['the right side of instanceof', 'const r = e instanceof v8.startupSnapshot#.X;'],
    ['an object pattern', 'const { a } = v8.startupSnapshot#.X;'],
    ['an array pattern', 'const [a] = v8.startupSnapshot#.X;'],
    ['an assignment to a pattern', 'let a;\n({ a } = v8.startupSnapshot#.X);'],
    ['a pattern default', 'function h({ a } = v8.startupSnapshot#.X) {\n  return a;\n}'],
    ['a nested pattern default', 'const { b: { a } = v8.startupSnapshot#.X } = o;'],
    ['a pattern default of a module', 'const { b: { a } = v8.startupSnapshot#.X } = v8;'],
    ['an array pattern default of a module', 'const { b: [a] = v8.startupSnapshot#.X } = v8;'],
    [
      'a pattern default of a required module',
      "({ b: { a } = v8.startupSnapshot#.X } = require('node:fs'));",
    ],
    ['a spread into an array', 'f([...(v8.startupSnapshot#.X)]);'],
    ['a spread into a call', 'f(...v8.startupSnapshot#.X);'],
    ['for…of', 'for (const v of v8.startupSnapshot#.X) {\n  f(v);\n}'],
    ['yield*', 'function* g() {\n  yield* v8.startupSnapshot#.X;\n}'],
    ['await before new', 'async function k() {\n  new (await v8.startupSnapshot#.X)();\n}'],
  ])('is a use in %s, as without `?.`', (_, code) => {
    const [optional, plain] = forms(code);
    expect(usagesOf(optional)).toEqual(usagesOf(plain));
    expect(usagesOf(optional)).toContain('api node:v8.startupSnapshot.X');
  });

  it.each([
    ['new', 'new (globalThis.Deno?.Command)();'],
    ['a pattern default', 'const { b: { a } = globalThis.Deno?.Command } = globalThis;'],
    ['instanceof', 'const r = e instanceof globalThis.Deno?.Command;'],
  ])('is a use of a global through the global object in %s', (_, code) => {
    expect(usagesOf(code)).toEqual(['api Deno.Command']);
  });
});

describe('a destructured default without `?.`', () => {
  it('passes the value on to the pattern, as a parameter default does', () => {
    expect(usagesOf(`${v8}const { b: { a } = v8.startupSnapshot.X } = o;`)).toEqual([
      'api node:v8',
      'api node:v8.startupSnapshot.X',
      'dynamic node:v8.startupSnapshot.X',
    ]);
    expect(usagesOf(`${v8}function h({ a } = v8.startupSnapshot.X) {\n  return a;\n}`)).toEqual([
      'api node:v8',
      'api node:v8.startupSnapshot.X',
      'dynamic node:v8.startupSnapshot.X',
    ]);
  });

  it('keeps a default with a plain name as it was', () => {
    expect(usagesOf(`${v8}const { b = v8.startupSnapshot.X } = o;`)).toEqual([
      'api node:v8',
      'api node:v8.startupSnapshot.X',
    ]);
  });
});

describe('an optional read whose value does not throw for undefined', () => {
  it.each([
    ['a further `?.`', 'const c = (v8.startupSnapshot?.X)?.z;'],
    ['`??`', 'const c = v8.startupSnapshot?.X ?? d;'],
    ['a pattern with `?? {}`', 'const { a } = v8.startupSnapshot?.X ?? {};'],
    ['an if', 'if (v8.startupSnapshot?.X) {\n  f();\n}'],
    ['typeof', 'const t = typeof v8.startupSnapshot?.X;'],
    ['a spread into an object', 'f({ ...v8.startupSnapshot?.X });'],
    ['the left side of instanceof', 'const r = v8.startupSnapshot?.X instanceof C;'],
    ['for…in', 'for (const k in v8.startupSnapshot?.X) {\n  f(k);\n}'],
    ['a plain name', 'const c = v8.startupSnapshot?.X;'],
    ['a default that is a plain name', 'function h(a = v8.startupSnapshot?.X) {\n  return a;\n}'],
    ['yield', 'function* g() {\n  yield v8.startupSnapshot?.X;\n}'],
    ['an assignment with `??=`', 'let a;\na ??= v8.startupSnapshot?.X;'],
  ])('is a check in %s', (_, code) => {
    expect(usagesOf(`${v8}${code}`)).toEqual(['api node:v8']);
  });
});
