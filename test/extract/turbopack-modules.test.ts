import { describe, expect, it } from 'vite-plus/test';

import { extractUsages } from '@/extract/index.ts';
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

/** Each usage, with ` [generated]` when it is marked as code that the bundler wrote. */
const marked = (source: string): string[] =>
  extractUsages('chunk.js', source, { globals: new Set(), nodeEnv: 'production' }).map(
    usage => `${usage.kind} ${usage.display}${usage.generated === true ? ' [generated]' : ''}`,
  );

const factory = (body: string, params = 'e, t, r'): string => `[78500, (${params}) => { ${body} }]`;
const exportsWrapper = 't.exports = e.x("node:async_hooks", () => require("node:async_hooks"))';

describe("Turbopack's module for a Node.js built-in", () => {
  it('marks the uses in it as code that the bundler wrote, and no other use', () => {
    expect(marked(`${factory(exportsWrapper)};\nrequire("node:buffer");`)).toEqual([
      'api node:async_hooks [generated]',
      'dynamic node:async_hooks [generated]',
      'api node:buffer',
    ]);
  });

  it('finds the parameters by position, not by name', () => {
    const renamed = factory('b.exports = a.x("node:fs", () => require("node:fs"))', 'a, b');
    expect(marked(renamed)).toEqual(['api node:fs [generated]', 'dynamic node:fs [generated]']);
  });

  it("does not mark the wrapper in the user's own module code", () => {
    expect(marked(`var rS = ${wrapper('node:timers')};\nrS.setTimeout(() => {}, 1);`)).toEqual([
      'api node:timers',
      'dynamic node:timers',
      'api node:timers.setTimeout',
    ]);
    expect(
      marked(`async function f() {\n  const t = await ${lazy};\n  t.setImmediate();\n}`),
    ).toEqual(['api node:timers', 'dynamic node:timers', 'api node:timers.setImmediate']);
  });
});

describe("what is not Turbopack's module for a Node.js built-in", () => {
  it.each([
    [
      'exports on the 1st parameter',
      factory('e.exports = e.x("node:fs", () => require("node:fs"))'),
    ],
    [
      'a loader that is not the 1st parameter',
      factory('t.exports = t.x("node:fs", () => require("node:fs"))'),
    ],
    [
      'a loader that is a global',
      factory('t.exports = process.x("node:fs", () => require("node:fs"))'),
    ],
    ['a method other than x', factory('t.exports = e.y("node:fs", () => require("node:fs"))')],
    [
      'a third argument',
      factory('t.exports = e.x("node:fs", () => require("node:fs"), process.env.X)'),
    ],
    ['a second statement', factory(`${exportsWrapper}; process.exit()`)],
    ['a compound assignment', factory('t.exports ||= e.x("node:fs", () => require("node:fs"))')],
    [
      'a wrapper of another module',
      factory('t.exports = e.x("node:fs", () => require("node:os"))'),
    ],
    ['a factory that is not in a list', `var m = (e, t) => { ${exportsWrapper} };`],
    ['a factory with no number before it', `[(e, t) => { ${exportsWrapper} }]`],
    ['a factory after a name, not a number', `["id", (e, t) => { ${exportsWrapper} }]`],
    [
      'a body that is not a block',
      '[1, (e, t) => (t.exports = e.x("node:fs", () => require("node:fs")))]',
    ],
  ])('does not mark %s', (_name, source) => {
    expect(marked(source).filter(usage => usage.endsWith('[generated]'))).toEqual([]);
  });
});
