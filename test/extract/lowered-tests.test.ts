import { parseSync } from 'oxc-parser';
import type { Node } from 'oxc-parser';
import { describe, expect, it } from 'vite-plus/test';

import { testOf } from '@/extract/lowered-tests.ts';

/** The expression of the only statement of `source`. */
function expressionOf(source: string): Node {
  const [statement] = parseSync('input.js', source, { preserveParens: true }).program.body;
  if (statement?.type !== 'ExpressionStatement') {
    throw new Error(`not an expression: ${source}`);
  }
  return statement.expression;
}

/** The temp name, whether it is a plain name, and `present`, of the test in `source`. */
function read(source: string): [string, boolean, boolean] | undefined {
  const test = testOf(expressionOf(source));
  return test === undefined
    ? undefined
    : [test.temp.name, test.temp.assignment === undefined, test.present];
}

describe('the test of a compiled chain', () => {
  it('reads a temp', () => {
    expect(read('(_a = x.y) == null')).toEqual(['_a', false, false]);
    expect(read('(_a = x.y) === null || _a === void 0')).toEqual(['_a', false, false]);
  });

  it('reads a plain name, which has no assignment', () => {
    expect(read('x == null')).toEqual(['x', true, false]);
    expect(read('x != null')).toEqual(['x', true, true]);
    expect(read('x === null || x === void 0')).toEqual(['x', true, false]);
    expect(read('x !== null && x !== void 0')).toEqual(['x', true, true]);
  });

  it('reads no strict compare alone, no pair on two names and no member', () => {
    expect(read('x === null')).toBeUndefined();
    expect(read('x === null || y === void 0')).toBeUndefined();
    expect(read('x.y == null')).toBeUndefined();
  });
});
