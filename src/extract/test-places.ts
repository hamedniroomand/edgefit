import type { Node } from 'oxc-parser';

import { unwrap } from './ast.ts';

/** The tests of a loop, a conditional or an `if`, where only the truth of a value counts. */
const testStatements = new Set([
  'IfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ConditionalExpression',
]);

/** Whether `node` is the test of an `if`, a `while`, `do` or `for` loop, or a `?:`. */
export function isTest(node: Node, parent: Node): boolean {
  return testStatements.has(parent.type) && 'test' in parent && parent.test === node;
}

/**
 * Whether `node` is an operand of an `&&` or `||` chain whose value only decides truthiness: the
 * test of an `if`, a loop or `?:`, or the operand of `!`. `if (a && x.y && b)` tests for `x.y`.
 * `outer` holds the ancestors above `parent`, nearest first.
 */
export function isTestedChain(parent: Node, outer: readonly Node[]): boolean {
  const joins = (item: Node): boolean =>
    item.type === 'LogicalExpression' && (item.operator === '&&' || item.operator === '||');
  if (!joins(parent)) {
    return false;
  }
  let value: Node = parent;
  for (const ancestor of outer) {
    if (joins(ancestor) || (ancestor.type !== 'AwaitExpression' && unwrap(ancestor) === value)) {
      value = ancestor;
    } else if (ancestor.type === 'UnaryExpression') {
      return ancestor.operator === '!';
    } else {
      return isTest(value, ancestor);
    }
  }
  return false;
}
