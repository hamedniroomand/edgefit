import type { Node } from 'oxc-parser';

import { invokers, staticKey, unwrap } from './ast.ts';

/** Whether `parent` reads a member of `node` with a fixed name, or calls `node`, and neither with `?.`. */
function usesValue(node: Node, parent: Node): boolean {
  if (parent.type === 'MemberExpression') {
    const key = staticKey(parent.property, parent.computed);
    // `fn.call(…)` is a use of `fn` in the walk, so its value is not read here.
    return parent.object === node && !parent.optional && key !== undefined && !invokers.has(key);
  }
  return parent.type === 'CallExpression' && parent.callee === node && !parent.optional;
}

/**
 * Whether a statement reads a member of the value of `node`, or calls it directly, as in
 * `(node).z;` or `(node).z(a).w();`, also as one item of a list joined with commas that is the
 * whole statement. Parentheses, type wrappers and `await` pass the value on. The value then
 * reaches no test or name, so no other code reads it as a check. `ancestors` holds the parents of
 * `node`, root first.
 */
export function isStatementUse(node: Node, ancestors: readonly Node[]): boolean {
  let current = node;
  let used = false;
  let listed = false;
  for (const parent of ancestors.toReversed()) {
    if (!listed && usesValue(current, parent)) {
      used = true;
    } else if (parent.type === 'SequenceExpression') {
      // Minified code joins statements with commas. Each item's value is dropped only when the
      // list is the whole statement, so nothing may read the list itself.
      listed = true;
    } else if (unwrap(parent) !== current) {
      return used && parent.type === 'ExpressionStatement' && parent.expression === current;
    }
    current = parent;
  }
  // The root is a `Program`, which the loop stops at.
  return false;
}

/**
 * Whether the value of `node` is dropped. That holds when `node` is a whole statement, an item of a
 * comma list other than the last, the operand of `void`, or the `init` or the `update` of a `for`.
 * It holds too for the last item of a comma list, the right side of `&&`, `||` or `??`, and a branch
 * of `?:`, when that expression is dropped as well. Parentheses, type wrappers and `await` pass the
 * value on. `ancestors` holds the parents of `node`, root first.
 */
export function isDiscarded(node: Node, ancestors: readonly Node[]): boolean {
  let current = node;
  for (const parent of ancestors.toReversed()) {
    if (parent.type === 'ExpressionStatement') {
      return parent.expression === current;
    }
    // The comma operator drops every value but the last. `void` drops its operand. A `for` reads
    // only its test.
    if (
      (parent.type === 'SequenceExpression' && parent.expressions.at(-1) !== current) ||
      (parent.type === 'UnaryExpression' && parent.operator === 'void')
    ) {
      return true;
    }
    if (parent.type === 'ForStatement') {
      return parent.init === current || parent.update === current;
    }
    const passes =
      parent.type === 'SequenceExpression' ||
      (parent.type === 'LogicalExpression' && parent.right === current) ||
      (parent.type === 'ConditionalExpression' && parent.test !== current) ||
      unwrap(parent) === current;
    if (!passes) {
      return false;
    }
    current = parent;
  }
  return false;
}
