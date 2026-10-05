import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const globals = new Set(['console']);
const usages = (source: string): string[] => usagesOf(source, 'src/input.ts', globals);
const known = ['api console', 'api console.log', 'api console.warn'];
const unknown = ['api console', 'dynamic console[<expression>]'];
const send = "function send(name) {\n  console[name]('x');\n}\n";

describe('a parameter that every call of its function gives a known string', () => {
  it('holds the strings of the calls', () => {
    expect(usages(`${send}send('log');\nsend('warn');`)).toEqual(known);
  });

  it('holds the strings of a call in a nested function', () => {
    expect(usages(`${send}function run() {\n  send('log');\n}\nsend('warn');`)).toEqual(known);
  });

  it('holds the member of each object of a list that the calls read', () => {
    const list = "const map = [{ n: 'a', c: 'log' }, { n: 'b', c: 'warn' }];\n";
    const code = `${list}function make(name) {\n  return () => console[name]('x');\n}\nfor (let i = 0; i < map.length; i++) {\n  make(map[i].c);\n}`;
    expect(usages(code)).toEqual(known);
  });

  it('adds the strings that the body writes to it', () => {
    const code = "function send(name) {\n  name = 'warn';\n  console[name]('x');\n}\nsend('log');";
    expect(usages(code)).toEqual(known);
  });
});

describe('a parameter that a call of its function can give an unknown value', () => {
  it.each([
    ['one call with an unknown value', `${send}send('log');\nsend(other);`],
    ['a call without the argument', `${send}send('log');\nsend();`],
    ['a call with a spread', `${send}send('log');\nsend(...list);`],
    ['a function that is never called', send],
    ['a function that is exported', `export ${send}send('log');`],
    ['a function that is passed on', `${send}send('log');\nlist.forEach(send);`],
    ['a function that is called through call()', `${send}send('log');\nsend.call(null, 'warn');`],
    [
      'a body that writes an unknown value',
      `function send(name) {\n  name = other;\n  console[name]('x');\n}\nsend('log');`,
    ],
    [
      'a name that an inner scope hides',
      `const level = 'log';\n${send}function run(level) {\n  send(level);\n}\nrun(other);`,
    ],
    [
      'a parameter with a default',
      `function send(name = 'log') {\n  console[name]('x');\n}\nsend('warn');`,
    ],
  ])('is unknown for %s', (_name, code) => {
    expect(usages(code)).toEqual(unknown);
  });
});
