import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const globals = new Set(['console']);
const members = (source: string): string[] =>
  usagesOf(source, 'src/input.js', globals).filter(usage => usage !== 'api console');
const keys = "const keys = ['log', 'warn'];\n";

describe('a name that holds one of a known set of strings', () => {
  it.each([
    ['a for-of const', `${keys}for (const key of keys) console[key]();`],
    ['a for-of let', `${keys}for (let key of keys) console[key]();`],
    ['a for-of var', `${keys}for (var key of keys) console[key]();`],
    ['a for-of over an array literal', "for (const key of ['log', 'warn']) console[key]();"],
    ['a forEach callback', `${keys}keys.forEach(function (key) { console[key](); });`],
    ['a map callback', `${keys}keys.map(key => console[key]());`],
    [
      'a let that is not written again',
      `${keys}function f(i) { let key = keys[i]; console[key](); }`,
    ],
    [
      'a var in a nested block',
      `${keys}function f(i) { if (x) { var key = keys[i]; } console[key](); }`,
    ],
    [
      'a const in a switch case',
      `${keys}switch (x) { case 1: const key = keys[i]; console[key](); }`,
    ],
  ])('is each string for %s', (_name, source) => {
    expect(members(source)).toEqual(['api console.log', 'api console.warn']);
  });

  it.each([
    ['a loop name', `${keys}for (let key of keys) { key = 'trace'; console[key](); }`],
    ['a callback parameter', `${keys}keys.forEach(key => { key = 'trace'; console[key](); });`],
    [
      'a let',
      `${keys}function f(i) { let key = keys[i]; if (!key) key = 'trace'; console[key](); }`,
    ],
  ])('adds each string written to %s', (_name, source) => {
    expect(members(source)).toEqual(['api console.log', 'api console.warn', 'api console.trace']);
  });
});

describe('a const that the file declares later', () => {
  it('reads a const that the file declares after the function', () => {
    expect(members("function f() {\n  console[name]();\n}\nexport const name = 'log';")).toEqual([
      'api console.log',
    ]);
  });
});

describe('a name that does not hold a known set of strings', () => {
  it.each([
    [
      'a loop name written with an unknown value',
      `${keys}for (let key of keys) { key = other; console[key](); }`,
    ],
    ['a loop name that changes', `${keys}for (let key of keys) { key += 'x'; console[key](); }`],
    [
      'a callback written with an unknown value',
      `${keys}keys.forEach(key => { key = other; console[key](); });`,
    ],
    [
      'a let written with an unknown value',
      `${keys}function f(i) { let key = keys[i]; key = other; console[key](); }`,
    ],
    ['a let with an unknown value', 'function f() { let key = other; console[key](); }'],
    [
      'a let written in a nested function',
      `${keys}function f(i) { let key = keys[i]; const g = () => { key = 'trace'; }; console[key](); }`,
    ],
    ['a var with the name of a parameter', "function f(key) { console[key](); var key = 'log'; }"],
    [
      'a var with the name of a function',
      "function f() { console[key](); var key = 'log'; function key() {} }",
    ],
    ['a for-in', `${keys}for (const key in keys) console[key]();`],
    ['a for-of with a pattern', `${keys}for (const [key] of keys) console[key]();`],
    ['a for-of over an unknown list', 'for (const key of list) console[key]();'],
    ['a callback of a method that is not a loop', `${keys}keys.reduce(key => console[key]());`],
    ['a callback that is not the first argument', `${keys}keys.forEach(x, key => console[key]());`],
    ['a callback with a pattern', `${keys}keys.forEach(([key]) => console[key]());`],
    ['a callback of an unknown list', 'list.forEach(key => console[key]());'],
    ['an object with a member write', "const M = { a: 'log' };\nM.a = other;\nconsole[M.a]();"],
    [
      'a parameter that shadows the const',
      `${keys}const key = keys[0];\nfunction f(key) { console[key](); }`,
    ],
  ])('stays unknown for %s', (_name, source) => {
    expect(usagesOf(source, 'src/input.js', globals)).toContain('dynamic console[<expression>]');
  });
});
