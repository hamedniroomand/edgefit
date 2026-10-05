import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vite-plus/test';

import { collectWrites } from '@/extract/writes.ts';

function writtenTo(source: string, name: string): string[] | null | undefined {
  const writes = collectWrites(parseSync('input.js', source).program.body).get(name);
  return writes === null || writes === undefined
    ? writes
    : writes.map(value => source.slice(value.start, value.end));
}

describe('collectWrites', () => {
  it.each([
    ['a declaration', "let m = 'a';", ["'a'"]],
    ['each assignment', "let m = 'a';\nm = 'b';\nm ||= 'c';", ["'a'", "'b'", "'c'"]],
  ])('records the value of %s', (_name, source, values) => {
    expect(writtenTo(source, 'm')).toEqual(values);
  });

  it.each([
    ['a compound assignment', "let m = 'a';\nm += 'b';"],
    ['an update', 'let m = 0;\nm++;'],
    ['a write to a member', "const m = { a: 'x' };\nm.a = other;"],
    ['a delete of a member', "const m = { a: 'x' };\ndelete m.a;"],
    ['a destructuring assignment', "let m = 'a';\n[m] = list;"],
    ['a destructuring declaration', 'var { m } = object;'],
    ['a loop head', "let m = 'a';\nfor (m of list) {}"],
    ['a write in a nested function', "let m = 'a';\nfunction f() { m = 'b'; }"],
    ['a declaration in a loop head', 'for (const m in object) {}'],
    ['a write after one with an unknown value', "let m = 'a';\nm += 'b';\nm = 'c';"],
  ])('marks the value unknown after %s', (_name, source) => {
    expect(writtenTo(source, 'm')).toBeNull();
  });

  it('records nothing for a declaration without a value', () => {
    expect(writtenTo('let m;', 'm')).toBeUndefined();
  });
});
