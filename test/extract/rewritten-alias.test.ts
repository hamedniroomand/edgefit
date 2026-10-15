import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const globals = new Set(['globalThis', 'self', 'global']);
const documentReads = (source: string, file = 'src/input.ts'): string[] =>
  usagesOf(source, file, globals).filter(usage => usage.startsWith('api document'));
// `export default {}` makes the file an ES module, so code outside it cannot write a top-level `let`.
const read = (code: string): string[] =>
  documentReads(`export default {};\nlet g = globalThis;\n${code}`);

describe('an alias of the global object that is written again', () => {
  it('drops the alias after a write of a plain value', () => {
    expect(read('g = {};\ng.document.body;')).toEqual([]);
    expect(read('function f() {\n  var g = self;\n  g = {};\n  g.document;\n}')).toEqual([]);
    expect(read('let h = self;\ng = {};\nh = {};\ng.document;\nh.document;')).toEqual([]);
  });

  it.each([
    ['a number', 'g = 1;'],
    ['null', 'g = null;'],
    ['a template', 'g = `a${x}`;'],
    ['an object of plain values', "g = { a: 1, 'b': null, c: `t` };"],
  ])('drops the alias after a write of %s', (_, write) => {
    expect(read(`${write}\ng.document;`)).toEqual([]);
  });

  it.each([
    ['a chain', 'g.document.body;'],
    ['an optional chain', 'g?.document;'],
    ['a TypeScript wrapper', '(g as any).document;'],
    ['a string key', "g['document'];"],
    ['a call of a member', 'g.document.open();'],
    ['an argument', 'f(g.document);'],
    ['a declaration', 'const d = g.document;'],
    ['an object value', 'f({ d: g.document });'],
  ])('drops the alias for a member read in %s', (_, use) => {
    expect(read(`g = {};\n${use}`)).toEqual([]);
  });

  it('drops the alias in a JavaScript module', () => {
    const source = 'let g = globalThis;\ng = {};\nexport const b = g.document.body;';
    expect(documentReads(source, 'src/input.js')).toEqual([]);
  });

  it('keeps a read that is before the write in the code', () => {
    expect(read('g.document;\ng = {};')).toEqual(['api document']);
    expect(read('function f() { g.document; }\ng = {};\nf();')).toEqual(['api document']);
  });

  it('drops the alias when a function after the write is an expression or in a nested block', () => {
    expect(read('g = {};\nconst f = () => g.document;\n{ function h() { g.document; } }')).toEqual(
      [],
    );
  });
});

describe('a write that keeps the alias of the global object', () => {
  it.each([
    ['in a branch', 'if (x) g = {};'],
    ['in a block', 'if (x) { g = {}; }'],
    ['in a loop', 'while (x) g = {};'],
    ['under a label', 'l: g = {};'],
    ['inside an expression', 'x && (g = {});'],
    ['in a nested function', 'function f() { g = {}; }'],
    ['with `||=`', 'g ||= {};'],
    ['with `??=`', 'g ??= {};'],
    ['of the global object', 'g = self;'],
    ['of another name of the global object', "g = typeof window !== 'undefined' ? window : self;"],
    ['that can keep the global object', 'g = g || {};'],
    ['of a call', 'g = Object(g);'],
    ['of a sequence', 'g = (0, globalThis);'],
    ['of an object with a member read', 'g = { d: x.y };'],
    ['of an object with a spread', 'g = { ...globalThis };'],
    ['of an object with a prototype', 'g = { __proto__: globalThis };'],
    ['of an object with a computed key', "g = { ['__proto__']: globalThis };"],
    ['of an object with the global object', 'g = { self: globalThis };'],
    ['of an object with a shorthand property', 'g = { globalThis };'],
    ['of an object with a getter', 'g = { get self() { return globalThis; } };'],
    ['of an object with a method', 'g = { f() {} };'],
    ['of an array with the global object', 'g = [globalThis];'],
    ['of an array of plain values', "g = [1, 'a'];"],
    ['of a nested object', "g = { c: { d: '' } };"],
    ['of a regular expression', 'g = /a/;'],
  ])('keeps the alias after a write %s', (_, write) => {
    expect(read(`${write}\ng.document;`)).toEqual(['api document']);
  });

  it('keeps the alias after a write of an awaited object', () => {
    const write = 'g = await { then(resolve) { resolve(globalThis); } };';
    expect(
      documentReads(
        `export default {};\nlet g = globalThis;\n${write}\ng.document;`,
        'src/input.mjs',
      ),
    ).toEqual(['api document']);
  });
});
