import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const reads = (source: string): string[] => usagesOf(source).filter(usage => usage.includes('.'));

const wrapper = (name: string, required = name): string =>
  `e.x("${name}", () => require("${required}"), !0)`;
const lazy = `Promise.resolve().then(() => ${wrapper('node:timers')})`;

describe("Turbopack's wrapper for a Node.js built-in", () => {
  it('binds the variable it is assigned to to the module', () => {
    const source = `var rS = ${wrapper('node:timers')};\nrS.setTimeout(() => {}, 1);`;
    expect(reads(source)).toEqual(['api node:timers.setTimeout']);
  });

  it('follows a destructured read and a default read', () => {
    expect(reads(`const { watch } = ${wrapper('node:fs')};\nwatch(".");`)).toEqual([
      'api node:fs.watch',
    ]);
    expect(reads(`var f = ${wrapper('node:fs')};\nf.default.cp();`)).toEqual(['api node:fs.cp']);
  });

  it('binds what an awaited lazy import becomes', () => {
    const destructured = `async function f() {\n  const { setTimeout: later } = await ${lazy};\n  later(() => {}, 1);\n}`;
    expect(reads(destructured)).toEqual(['api node:timers.setTimeout']);
    const whole = `async function f() {\n  const t = await ${lazy};\n  t.setImmediate();\n}`;
    expect(reads(whole)).toEqual(['api node:timers.setImmediate']);
  });
});

describe("what is not Turbopack's wrapper", () => {
  it.each([
    ['a name without the node: prefix', wrapper('fs')],
    ['a different module in the arrow function', wrapper('node:fs', 'node:os')],
    [
      'an arrow function that does not return a require',
      'e.x("node:fs", () => load("node:fs"), !0)',
    ],
    ['a function with a block body', 'e.x("node:fs", () => { return require("node:fs"); }, !0)'],
    ['a second argument that is not a function', 'e.x("node:fs", "node:fs", !0)'],
    ['a computed name', 'e.x(name, () => require("node:fs"), !0)'],
  ])('does not bind %s', (_name, call) => {
    expect(reads(`var m = ${call};\nm.watch(".");`)).toEqual([]);
  });

  it.each([
    ['a lazy import that is not a wrapper', 'Promise.resolve().then(() => load("node:fs"))'],
    ['a then on another receiver', `other.then(() => ${wrapper('node:fs')})`],
    ['a then with a block body', `Promise.resolve().then(() => { return ${wrapper('node:fs')}; })`],
  ])('does not bind %s', (_name, call) => {
    expect(reads(`async function f() {\n  const m = await ${call};\n  m.watch('.');\n}`)).toEqual(
      [],
    );
  });
});
