import { describe, expect, it } from 'vite-plus/test';

import { findAssignedOptions } from '@/extract/assigned.ts';
import { parse } from '@/extract/index.ts';

const optionsOf = (source: string, paths: string[] = ['auth.lock']): string[] =>
  findAssignedOptions(parse('lib/input.js', source).program.body as never, paths);

describe('an option path of the data', () => {
  it.each([
    ['a property under the first name', 'x({ auth: { lock: fn } });'],
    ['a shorthand property', 'x({ auth: { lock } });'],
    ['quoted keys', "x({ 'auth': { 'lock': fn } });"],
    ['a value in parentheses', 'x({ auth: ({ lock: fn }) });'],
    ['a spread beside the property', 'x({ auth: { ...base, lock: fn } });'],
    ['another property beside the path', 'x({ auth: { storage: s, lock: fn }, other: 1 });'],
    ['more names above the path', 'x({ supabase: { auth: { lock: fn } } });'],
    ['an object literal in a function', 'function f() { return { auth: { lock: fn } }; }'],
    ['an object in a spread call', 'x({ auth: { ...f({ lock: fn }) } });'],
    ['an object in a conditional spread', 'x({ auth: { ...(ok ? { lock: fn } : {}) } });'],
  ])('sets the path with %s', (_label, code) => {
    expect(optionsOf(code)).toContain('auth.lock');
  });
});

describe('an option path of the data that a file does not set', () => {
  it('sets no plain name for the path, and nothing without the path in the list', () => {
    expect(optionsOf('x({ auth: { lock: fn } });')).toEqual(['auth', 'auth.lock']);
    expect(optionsOf('x({ auth: { lock: fn } });', [])).toEqual(['auth']);
    expect(optionsOf('x({ auth: { storage: fn } });')).toEqual(['auth']);
  });

  it.each([
    ['a direct property', 'x({ lock: fn });', ['lock']],
    ['a member assignment', 'x.auth.lock = fn;', ['lock']],
    ['another name above it', 'x({ other: { lock: fn } });', ['other']],
    ['a value that is false', 'x({ auth: { lock: false } });', ['auth']],
    ['a value that is null', 'x({ auth: { lock: null } });', ['auth']],
    ['a value that is undefined', 'x({ auth: { lock: undefined } });', ['auth']],
    ['an array between the names', 'x({ auth: [{ lock: fn }] });', ['auth']],
    ['a call between the names', 'x({ auth: f({ lock: fn }) });', ['auth']],
    ['a function in a spread', 'x({ auth: { ...g(() => ({ lock })) } });', ['auth', 'lock']],
    ['a method', 'x({ auth: { lock() {} } });', ['auth']],
    ['a getter', 'x({ auth: { get lock() { return fn; } } });', ['auth']],
    ['a computed key above it', 'x({ [key]: { lock: fn } });', []],
    ['a computed key beside it', 'x({ auth: { [key]: fn } });', ['auth']],
    [
      'a function between the names',
      'x({ auth: function () { return { lock: fn }; } });',
      ['auth', 'lock'],
    ],
    ['a destructuring assignment inside', 'x({ auth: { ...({ lock } = env) } });', ['auth']],
    ['a nested destructuring pattern', 'const { auth: { lock } } = env;', []],
    ['a pattern with a default value', 'function f({ auth: { lock } } = {}) {}', []],
  ])('does not set the path with %s', (_label, code, expected) => {
    expect(optionsOf(code)).toEqual(expected);
  });

  it('matches the end of a longer path, and only the whole path', () => {
    const paths = ['a.b.c'];
    expect(optionsOf('x({ a: { b: { c: 1 } } });', paths)).toContain('a.b.c');
    expect(optionsOf('x({ z: { a: { b: { c: 1 } } } });', paths)).toContain('a.b.c');
    expect(optionsOf('x({ b: { c: 1 } });', paths)).not.toContain('a.b.c');
    expect(optionsOf('x({ a: { x: { b: { c: 1 } } } });', paths)).not.toContain('a.b.c');
  });

  it('does not take the keys of a schema as a path', () => {
    const schema = "x({ properties: { http2: { type: 'boolean' } } });";
    expect(optionsOf(schema, ['server.http2'])).toEqual(['properties']);
  });
});
