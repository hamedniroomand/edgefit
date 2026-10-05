import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const globals = new Set(['console', 'globalThis']);
const usages = (source: string): string[] => usagesOf(source, 'src/input.js', globals);

describe('a computed key read from a known value', () => {
  it.each([
    ['an element by its index', "const keys = ['log', 'warn'];\nconsole[keys[1]]();", ['warn']],
    [
      'an element by an unknown index',
      "const keys = ['log', 'warn'];\nconsole[keys[i]]();",
      ['log', 'warn'],
    ],
    ['a member by its name', "const L = { a: 'debug', b: 'info' };\nconsole[L.a]();", ['debug']],
    ['a member after a spread', "const L = { ...more, a: 'debug' };\nconsole[L.a]();", ['debug']],
    [
      'a member by a computed name',
      "const L = { a: 'debug', b: 'info' };\nconsole[L['b']]();",
      ['info'],
    ],
    [
      'a list in an object',
      "const logger = { methods: ['debug', 'info'], log() {} };\nconsole[logger.methods[level]]();",
      ['debug', 'info'],
    ],
    [
      'a map that joins a string',
      "const keys = ['dir', 'group'].map(name => name + 'End');\nconsole[keys[i]]();",
      ['dirEnd', 'groupEnd'],
    ],
    [
      'a map that joins with a template',
      "const keys = ['dir', 'group'].map(name => `${name}End`);\nconsole[keys[0]]();",
      ['dirEnd'],
    ],
    [
      'a list of names that hold strings',
      "const a = 'log';\nconst keys = [a, 'warn'];\nconsole[keys[i]]();",
      ['log', 'warn'],
    ],
  ])('is %s', (_name, source, members) => {
    expect(usages(source).filter(usage => usage !== 'api console')).toEqual(
      members.map(member => `api console.${member}`),
    );
  });
});

describe('a computed key read from a value that is not fully known', () => {
  it.each([
    ['a member that is not in the list', "const keys = ['log'];\nconsole[keys.length]();"],
    ['a member that is not in the object', "const L = { a: 'log' };\nconsole[L.b]();"],
    [
      'an unknown key of an object with a function',
      'const L = { a: "log", f() {} };\nconsole[L[k]]();',
    ],
    ['a member before a spread', "const L = { a: 'log', ...more };\nconsole[L.a]();"],
    ['a member before a getter', "const L = { a: 'log', get a() { return x; } };\nconsole[L.a]();"],
    ['a member before a computed key', "const L = { a: 'log', [k]: 'warn' };\nconsole[L.a]();"],
    ['an empty list', 'const keys = [];\nconsole[keys[i]]();'],
    ['a list with a hole', "const keys = ['log', , 'warn'];\nconsole[keys[i]]();"],
    ['a list with a spread', "const keys = ['log', ...more];\nconsole[keys[i]]();"],
    ['a list with a value that is not known', "const keys = ['log', other];\nconsole[keys[i]]();"],
    ['a list of lists', "const keys = [['log']];\nconsole[keys[i]]();"],
    ['a map that is not a join', "const keys = ['log'].map(name => other);\nconsole[keys[i]]();"],
    [
      'a map with a block',
      "const keys = ['log'].map(name => { return name; });\nconsole[keys[i]]();",
    ],
    [
      'a map of objects',
      "const keys = [{ a: 'log' }].map(item => item + 'x');\nconsole[keys[i]]();",
    ],
    ['a map on an unknown list', 'const keys = list.map(name => name);\nconsole[keys[i]]();'],
    ['a call that is not a map', "const keys = ['log'].filter(name => name);\nconsole[keys[i]]();"],
  ])('stays unknown for %s', (_name, source) => {
    expect(usages(source)).toContain('dynamic console[<expression>]');
  });

  it('reads a known member of a mapped list whose other members are not known', () => {
    expect(
      usages("const keys = ['log', { a: 1 }].map(name => name + 'x');\nconsole[keys[0]]();"),
    ).toEqual(['api console.logx']);
  });
});
