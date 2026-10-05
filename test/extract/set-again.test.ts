import { parseSync } from 'oxc-parser';
import type { Node } from 'oxc-parser';
import { describe, expect, it } from 'vite-plus/test';

import { namesSetAgain } from '@/extract/set-again.ts';

function setAgain(source: string): string[] {
  const body = parseSync('input.js', source).program.body as Node[];
  return [...namesSetAgain(body)];
}

describe('names that a block sets again', () => {
  it.each([
    ['an assignment', 'var a = 1; a = 2;'],
    ['an update', 'let a = 1; a++;'],
    ['a write in a nested function', 'var a = 1; function f() { a = 2; }'],
    ['a var in a nested block', 'var a = 1; if (x) { var a = 2; }'],
    ['a loop target', 'var a = 1; for (a of xs) {}'],
    ['a var loop head', 'var a = 1; for (var a in xs) {}'],
  ])('counts %s', (_, source) => {
    expect(setAgain(source)).toEqual(['a']);
  });

  it.each([
    ['one value', 'var a = 1; var b; b = 2;'],
    ['a parameter of a nested function', 'var a = 1; function f(a) { a = 2; }'],
    ['a var of a nested function', 'var a = 1; var f = function () { var a = 2; };'],
    ['a name of a function expression', 'var a = 1; (function a() { a = 2; });'],
    ['a let in a nested block', 'var a = 1; { let a = 2; }'],
    ['a let in a switch', 'var a = 1; switch (x) { case 1: let a = 2; }'],
    ['a catch parameter', 'var a = 1; try {} catch (a) { a = 2; }'],
    ['a let loop head', 'var a = 1; for (let a = 0; a < 2; a++) {}'],
    ['a const loop head', 'var a = 1; for (const a of xs) {}'],
    ['an arrow parameter', 'var a = 1; const f = a => (a = 2);'],
  ])('does not count %s', (_, source) => {
    expect(setAgain(source)).toEqual([]);
  });

  it('gives the same result for the same block', () => {
    const body = parseSync('input.js', 'var a = 1; a = 2;').program.body as Node[];
    expect(namesSetAgain(body)).toBe(namesSetAgain(body));
  });
});
