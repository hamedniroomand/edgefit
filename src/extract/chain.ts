import type { Node } from 'oxc-parser';

import type { ApiRef } from '@/types.ts';

import { isSymbolKey, staticKey, strip, unwrap } from './ast.ts';
import { resolveBinding } from './bindings.ts';
import type { BindingContext } from './bindings.ts';
import { memberRef } from './refs.ts';
import { isTracked, lookupSymbol } from './scope.ts';
import type { Scope } from './scope.ts';

const invokers = new Set(['apply', 'bind', 'call']);

export type ChainResult =
  | {
      kind: 'static';
      ref: ApiRef;
      offset: number;
      extended: boolean;
      node: Node;
      parent: Node | undefined;
    }
  | {
      kind: 'computed';
      ref: ApiRef;
      offset: number;
      propertyOffset: number;
      /** The member access with the computed key, and what it sits in. */
      member: Node;
      memberParent: Node | undefined;
    };

function isSymbol(key: Node, scope: Scope): boolean {
  const inner = strip(key);
  return isSymbolKey(inner) || (inner.type === 'Identifier' && lookupSymbol(scope, inner.name));
}

/**
 * Follows the reference at the top of the ancestor stack up through member accesses
 * and value-preserving wrappers, so `(await import('fs')).promises.watch` yields
 * `fs.promises.watch`. Stops at the first computed key it cannot read statically.
 */
export function followChain(
  stack: readonly Node[],
  ref: ApiRef,
  offset: number,
  scope: Scope,
): ChainResult {
  let position = stack.length - 1;
  let node = stack[position];
  let current = { ref, offset, extended: false };
  let parent = stack[position - 1];
  while (node !== undefined && parent !== undefined) {
    if (parent.type === 'MemberExpression' && parent.object === node) {
      const key = staticKey(parent.property, parent.computed);
      if (key !== undefined && current.ref.path.length > 0 && invokers.has(key)) {
        // `fn.call(...)` uses `fn` itself; `call` is not part of the API.
        break;
      }
      if (key === undefined && parent.computed && isSymbol(parent.property, scope)) {
        // A symbol is never an API name, so the chain ends here without being unknown.
        break;
      }
      if (key === undefined) {
        return {
          kind: 'computed',
          ...current,
          propertyOffset: parent.property.start,
          member: parent,
          memberParent: stack[position - 2],
        };
      }
      current = { ref: memberRef(current.ref, key), offset: parent.property.start, extended: true };
    } else if (unwrap(parent) !== node) {
      break;
    }
    node = parent;
    position -= 1;
    parent = stack[position - 1];
  }
  if (node === undefined) {
    throw new Error('followChain needs the reference on the ancestor stack');
  }
  return { kind: 'static', ...current, node, parent };
}

const testStatements = new Set([
  'IfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
]);

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
      return (
        (testStatements.has(ancestor.type) || ancestor.type === 'ConditionalExpression') &&
        'test' in ancestor &&
        ancestor.test === value
      );
    }
  }
  return false;
}

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
