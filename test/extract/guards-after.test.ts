import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const globals = new Set(['console']);
const members = (source: string): string[] =>
  usagesOf(source, 'src/input.js', globals).filter(usage => usage !== 'api console');
const keys = "const keys = ['log', 'warn'];\n";
const loop = (body: string): string => `${keys}for (let key of keys) {\n  ${body}\n}`;

describe('a check of a computed key', () => {
  it.each([
    ['typeof is function', "if (typeof console[key] === 'function') console[key]();"],
    ['typeof is not undefined', "if (typeof console[key] !== 'undefined') console[key]();"],
    ['a guard clause', 'if (!console[key]) continue;\n  console[key]();'],
  ])('guards the read after %s', (_name, body) => {
    expect(members(loop(body))).toEqual([
      'api console.log [guarded]',
      'api console.warn [guarded]',
    ]);
  });

  it('does not guard a read of the same members with another key', () => {
    expect(members(loop("if (typeof console[key] === 'function') console.warn();"))).toEqual([
      'api console.warn',
    ]);
  });

  it('guards nothing when the key is not a name', () => {
    expect(
      members(`${keys}if (typeof console[keys[i]] === 'function') console[keys[i]]();`),
    ).toEqual(['api console.log', 'api console.warn']);
  });

  it('does not guard a read through another name that is the same word', () => {
    expect(
      members(
        "let k = ['log', 'warn'][i];\nif (typeof console[k] === 'function') {\n  ['warn', 'error'].forEach(k => console[k]());\n}",
      ),
    ).toEqual(['api console.warn', 'api console.error']);
  });

  it('stops the guard when the key is written', () => {
    expect(
      members(loop("if (typeof console[key] === 'function') { key = 'trace'; console[key](); }")),
    ).toEqual(['api console.log', 'api console.warn', 'api console.trace']);
  });
});

describe('a fallback for a missing member', () => {
  const read = (check: string): string =>
    `${keys}function f(i) {\n  var method = keys[i];\n  ${check}\n  console[method]();\n}`;

  it.each([
    ['a missing member', "if (!console[method]) { method = 'trace'; }"],
    ['typeof is not function', "if (typeof console[method] !== 'function') method = 'trace';"],
    ['a nullish member', "if (console[method] == null) method = 'trace';"],
    ['an undefined member', "if (undefined === console[method]) method = 'trace';"],
  ])('guards each other member after %s', (_name, check) => {
    expect(members(read(check))).toEqual([
      'api console.log [guarded]',
      'api console.warn [guarded]',
      'api console.trace',
    ]);
  });

  it('guards nothing when a nested function writes the key', () => {
    const source = `${keys}function f(i) {\n  let method = keys[i];\n  const reset = () => { method = 'trace'; };\n  if (!console[method]) method = 'log';\n  reset();\n  console[method]();\n}`;
    expect(usagesOf(source, 'src/input.js', globals)).toContain('dynamic console[<expression>]');
  });

  it('does not guard the fallback when it is in the list', () => {
    expect(members(read("if (!console[method]) method = 'log';"))).toEqual([
      'api console.log',
      'api console.warn [guarded]',
    ]);
  });

  it.each([
    ['an else branch', "if (!console[method]) method = 'trace'; else other();"],
    ['a write to another name', "if (!console[method]) other = 'trace';"],
    ['a branch that does more', "if (!console[method]) { method = 'trace'; other(); }"],
    ['an empty branch', 'if (!console[method]) {}'],
    ['a check of another value', "if (!other) method = 'trace';"],
    ['a check of two values', "if (console[method] === other) method = 'trace';"],
    ['a check of a static member', "if (!console.log) method = 'trace';"],
  ])('guards nothing after %s', (_name, check) => {
    expect(members(read(check)).every(usage => !usage.endsWith('[guarded]'))).toBe(true);
  });
});
