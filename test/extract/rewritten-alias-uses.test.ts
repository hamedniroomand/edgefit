import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const globals = new Set(['globalThis', 'self', 'global']);
const documentReads = (source: string, file = 'src/input.ts'): string[] =>
  usagesOf(source, file, globals).filter(usage => usage.startsWith('api document'));
// `export default {}` makes the file an ES module, so code outside it cannot write a top-level `let`.
const read = (code: string): string[] =>
  documentReads(`export default {};\nlet g = globalThis;\n${code}`);

describe('code that can give an alias of the global object the global again', () => {
  it.each([
    ['an assignment', 'g = globalThis;'],
    ['an assignment in a branch', 'if (x) g = globalThis;'],
    ['an object pattern', '({ g } = { g: globalThis });'],
    ['an array pattern', '[g] = [globalThis];'],
    ['a loop target', 'for (g of [globalThis]) {}'],
    ['an update', 'g++;'],
    ['a compound assignment', "g += '';"],
    ['an `as` target', '(g as any) = globalThis;'],
    ['a non-null target', 'g! = globalThis;'],
    ['Object.assign', 'Object.assign(g, globalThis);'],
    ['Object.setPrototypeOf', 'Object.setPrototypeOf(g, globalThis);'],
    ['eval', "eval('g = globalThis');"],
    ['a copy of the name', 'const h = g;\nObject.assign(h, globalThis);'],
    ['a spread', 'f({ ...g });'],
    ['typeof', 'typeof g;'],
  ])('keeps the alias after %s', (_, use) => {
    expect(read(`g = {};\n${use}\ng.document;`)).toEqual(['api document']);
  });

  it.each([
    ['a member write', 'g.self = globalThis;'],
    ['a member write through a TypeScript wrapper', '(g.self as any) = globalThis;'],
    ['a write to the prototype', 'g.__proto__.self = globalThis;'],
    ['a copy of the prototype', 'const p = g.__proto__;\np.self = globalThis;'],
    [
      'a change through the constructor',
      'Object.assign(g.constructor.prototype, { self: globalThis });',
    ],
    ['a member that gives the object back', 'g.valueOf().self = globalThis;'],
    ['a getter of the prototype', "g.__lookupGetter__('__proto__').call({}).self = globalThis;"],
    ['a getter that the object defines', "g.__defineGetter__('self', () => globalThis);"],
    ['a member in an array pattern', '[g.self] = [globalThis];'],
    ['a member in an object pattern', '({ a: g.self } = { a: globalThis });'],
    ['a computed key', 'g[key] = globalThis;'],
    ['a delete', 'delete g.self;'],
    ['a member update', 'g.self++;'],
  ])('keeps the alias after %s', (_, use) => {
    expect(read(`g = {};\n${use}\ng.self.document;`)).toEqual(['api document']);
  });
});

describe('other code that can write an alias of the global object', () => {
  it('keeps the alias when a function made before the write changes the object', () => {
    expect(
      read('const f = () => Object.assign(g, globalThis);\ng = {};\nf();\ng.document;'),
    ).toEqual(['api document']);
  });

  it('keeps the alias when a loop head declares the name again', () => {
    const source =
      'function f() {\n  var g = globalThis;\n  g = {};\n  for (var g of [globalThis]) {}\n  g.document;\n}';
    expect(documentReads(source)).toEqual(['api document']);
  });

  it('keeps the alias of a parameter that `arguments` can write', () => {
    const source =
      'function f(g) {\n  var g = globalThis;\n  g = {};\n  arguments[0] = globalThis;\n  g.document;\n}';
    expect(documentReads(source, 'src/input.js')).toEqual(['api document']);
  });

  it('keeps the alias in a scope with `with`', () => {
    const source =
      'function f() {\n  var g = globalThis;\n  g = {};\n  with ({ g: globalThis }) { g.document; }\n}';
    expect(documentReads(source, 'src/input.js')).toEqual(['api document']);
  });

  it('keeps an alias that a later write gives to a name declared with no value', () => {
    expect(
      documentReads('export default {};\nlet g;\ng = {};\ng = globalThis;\ng.document;'),
    ).toEqual(['api document']);
  });
});

describe('an alias of the global object that other code can reach', () => {
  it.each([
    ['a top-level var', 'export default {};\nvar g = globalThis;\ng = {};\ng.document;'],
    ['a top-level let in a script', 'let g = globalThis;\ng = {};\ng.document;'],
    [
      'a top-level let in a file with only a type import',
      "import type { A } from 'a';\nlet g = globalThis;\ng = {};\ng.document;",
    ],
    [
      'a var in a top-level block',
      'export default {};\n{ var g = globalThis; }\ng = {};\ng.document;',
    ],
    ['an exported let', 'export let g = globalThis;\ng = {};\ng.document;'],
    ['a let in a named export', 'let g = globalThis;\nexport { g };\ng = {};\ng.document;'],
    [
      'a second declaration',
      'function m() {\n  var g = globalThis;\n  function f() { var g = 1; }\n  g = {};\n  g.document;\n}',
    ],
  ])('keeps %s', (_, source) => {
    expect(documentReads(source)).toEqual(['api document']);
  });

  it.each([
    ['a function', 'function f() { g.document; }'],
    ['an async function', 'async function f() { g.document; }'],
    ['a generator', 'function* f() { g.document; }'],
    ['an exported function', 'export function f() { g.document; }'],
    ['a default export', 'export default function f() { g.document; }'],
    ['an anonymous default export', 'export default function () { g.document; }'],
  ])('keeps the alias when %s declared after the write can run before it', (_, declaration) => {
    expect(read(`f();\ng = {};\n${declaration}`)).toEqual(['api document']);
  });

  it('keeps the alias when a labeled function declared after the write can run before it', () => {
    const source =
      'function m() {\n  var g = globalThis;\n  f();\n  g = {};\n  l: function f() { g.document; }\n}';
    expect(documentReads(source, 'src/input.js')).toEqual(['api document']);
  });
});
