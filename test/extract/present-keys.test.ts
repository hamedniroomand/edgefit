import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const globals = new Set(['globalThis', 'global', 'console']);
const usages = (source: string): string[] => usagesOf(source, 'src/input.ts', globals);
const unknown = 'dynamic global[<expression>]';
const jsdom = (test: string, read = 'global[name]'): string =>
  `const names = require('./names.json');\nconst list = Object.entries(names).filter(${test});\nfunction install(window) {\n  for (const [name, desc] of list) {\n    window[name] = ${read};\n  }\n}\n`;

describe('a key that an `in` test proved present', () => {
  it.each([
    ['a pair list', jsdom('([name]) => name in global')],
    ['a pair list with a parenthesised test', jsdom('([name]) => (name in global)')],
    ['a function expression', jsdom('function ([name]) { return name in global; }')],
    [
      'a list of names',
      'const list = Object.keys(x).filter(name => name in global);\nfor (const name of list) global[name];',
    ],
  ])('is not unknown in a loop over %s', (_label, code) => {
    expect(usages(code)).not.toContain(unknown);
  });

  it('is the use of the object only, as a read with a fallback is', () => {
    const code =
      "const list = ['log', 'warn'].filter(name => name in console);\nfor (const name of list) console[name];";
    expect(usages(code)).toEqual(['api console']);
  });
});

describe('a key that no `in` test proved present', () => {
  it.each([
    ['another object', jsdom('([name]) => name in other')],
    ['a test that is negated', jsdom('([name]) => !(name in global)')],
    ['a test of the other item of the pair', jsdom('([, desc]) => desc in global')],
    ['a callback with more than the test', jsdom('([name]) => name.length > 1 && name in global')],
  ])('stays unknown for %s', (_label, code) => {
    expect(usages(code)).toContain(unknown);
  });

  it('stays unknown when the read is on another object', () => {
    expect(usages(jsdom('([name]) => name in global', 'globalThis[name]'))).toContain(
      'dynamic globalThis[<expression>]',
    );
  });

  it('stays unknown when the loop writes the name', () => {
    const code = jsdom('([name]) => name in global').replace(
      'window[name] =',
      'name = other;\n    window[name] =',
    );
    expect(usages(code)).toContain(unknown);
  });

  it('stays unknown when an inner function declares the name again', () => {
    const code = jsdom('([name]) => name in global').replace(
      'window[name] = global[name];',
      'window.f = function (name) {\n      return global[name];\n    };',
    );
    expect(usages(code)).toContain(unknown);
  });

  it('stays unknown for a list that is declared twice', () => {
    const code = `${jsdom('([name]) => name in global')}function other(list) {\n  for (const [name] of list) global[name];\n}\n`;
    expect(usages(code)).toContain(unknown);
  });

  it('stays unknown for a let list', () => {
    expect(usages(jsdom('([name]) => name in global').replace('const list', 'let list'))).toContain(
      unknown,
    );
  });
});

describe('a key read that an `in` test does not cover', () => {
  it.each([
    ['called in place', 'global[name]()'],
    ['read further', 'global[name].x'],
  ])('stays unknown when the read is %s', (_label, read) => {
    expect(usages(jsdom('([name]) => name in global', read))).toContain(unknown);
  });

  it('stays unknown when the test is of a parameter of the callback', () => {
    expect(usages(jsdom('([name], index, global) => name in global'))).toContain(unknown);
  });

  it('stays unknown for a var in the loop head', () => {
    const code = jsdom('([name]) => name in global').replace('for (const', 'for (var');
    expect(usages(code)).toContain(unknown);
  });
});
