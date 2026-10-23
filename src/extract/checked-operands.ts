import type { Node } from 'oxc-parser';

import { strip, unwrap } from './ast.ts';
import { resolveBinding } from './bindings.ts';
import type { BindingContext } from './bindings.ts';
import { isFallbackRead } from './fallback-reads.ts';
import { isTracked } from './scope.ts';

const logicalChecks = new Set(['||', '??']);

/** Whether the value of `node` is an API, or the last one of a chain of `||` and `??` that holds an API. */
function isApiValue(node: Node, context: BindingContext): boolean {
  const inner = strip(node);
  return inner.type === 'LogicalExpression' && logicalChecks.has(inner.operator)
    ? isApiValue(inner.right, context)
    : isTracked(resolveBinding(inner, context));
}

/**
 * Whether `node` is an operand of `||` or `??`, as in `a.b ?? a.c`. A missing member gives
 * `undefined` and the operator moves on, so the read is a check. The right operand counts when the
 * left one is an API too: `a.b || a.c` looks for a name. In `options.x || process.platform` the right
 * operand is the value that the code uses. It is a use when the value is called in place, as in
 * `(a.b || c)()`, because a present `b` that throws still fails.
 * `outer` holds the ancestors above `parent`, nearest first.
 */
export function isCheckedOperand(
  node: Node,
  parent: Node,
  outer: readonly Node[],
  context: BindingContext,
): boolean {
  if (isFallbackRead(node, parent, outer)) {
    return true;
  }
  if (parent.type !== 'LogicalExpression' || !logicalChecks.has(parent.operator)) {
    return false;
  }
  if (parent.right === node && !isApiValue(parent.left, context)) {
    return false;
  }
  let value: Node = parent;
  for (const ancestor of outer) {
    const passes =
      (ancestor.type === 'LogicalExpression' && logicalChecks.has(ancestor.operator)) ||
      (ancestor.type !== 'AwaitExpression' && unwrap(ancestor) === value);
    if (!passes) {
      return !(ancestor.type === 'CallExpression' && ancestor.callee === value);
    }
    value = ancestor;
  }
  return true;
}
