import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const globals = new Set(['console']);
const usages = (source: string): string[] => usagesOf(source, 'src/input.ts', globals);
const methods = "const Method = { debug: 'log', warn: 'warn', error: 'error' };\n";

describe('a computed key that holds one of a known set of strings', () => {
  it('is each value of an object of strings', () => {
    expect(
      usages(
        `${methods}function f(level) {\n  const method = Method[level];\n  console[method]('x');\n}`,
      ),
    ).toEqual(['api console', 'api console.log', 'api console.warn', 'api console.error']);
  });

  it('is the string of a const', () => {
    expect(usages("const name = 'log';\nconsole[name]('x');")).toEqual(['api console.log']);
  });

  it('is not unknown when the object has a computed key', () => {
    expect(
      usages("const Method = { [A]: 'log', [B]: 'info' };\nconst m = Method[k];\nconsole[m]('x');"),
    ).toEqual(['api console', 'api console.log', 'api console.info']);
  });

  it('records nothing when the key is only tested', () => {
    expect(
      usages(`${methods}const m = Method[k];\nif (typeof console[m] === 'function') {}`),
    ).toEqual(['api console']);
  });

  it.each([
    [
      'an object with a value that is not a string',
      "const Method = { a: 'log', b: other };\nconst m = Method[k];\nconsole[m]('x');",
    ],
    [
      'an object with a spread',
      "const Method = { a: 'log', ...more };\nconst m = Method[k];\nconsole[m]('x');",
    ],
    ['an empty object', "const Method = {};\nconst m = Method[k];\nconsole[m]('x');"],
    [
      'a let written with an unknown value',
      "const Method = { a: 'log' };\nlet m = Method[k];\nm = other;\nconsole[m]('x');",
    ],
    ['a parameter', 'function f(m) {\n  console[m]("x");\n}'],
    [
      'a name that a nearer declaration replaces',
      `${methods}const m = Method[k];\nfunction f(m) {\n  console[m]('x');\n}`,
    ],
  ])('stays unknown for %s', (_name, source) => {
    expect(usages(source)).toContain('dynamic console[<expression>]');
  });
});

describe('a computed key from a let', () => {
  it('is each value of a let that is not written again', () => {
    expect(usages("const Method = { a: 'log' };\nlet m = Method[k];\nconsole[m]('x');")).toEqual([
      'api console.log',
    ]);
  });
});

describe('a computed key that is a member of each object of a list', () => {
  it('is the member of each object of a list', () => {
    const list = "const map = [{ n: 'a', c: 'log' }, { n: 'b', c: 'warn' }];\n";
    expect(usages(`${list}for (let i = 0; i < map.length; i++) console[map[i].c]('x');`)).toEqual([
      'api console',
      'api console.log',
      'api console.warn',
    ]);
  });

  it('is unknown when an object of the list lacks the member', () => {
    const list = "const map = [{ n: 'a', c: 'log' }, { n: 'b' }];\n";
    expect(usages(`${list}for (let i = 0; i < map.length; i++) console[map[i].c]('x');`)).toEqual([
      'api console',
      'dynamic console[<expression>]',
    ]);
  });
});
