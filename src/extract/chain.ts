import type { Node } from 'oxc-parser';

import type { ApiRef } from '@/types.ts';

import {
  invokers,
  isEquality,
  isInequality,
  isSymbolKey,
  staticKey,
  stringLiteral,
  strip,
  unwrap,
} from './ast.ts';
import { resolveBinding } from './bindings.ts';
import type { BindingContext } from './bindings.ts';
import { keysOf } from './known-values.ts';
import { memberRef } from './refs.ts';
import { declaringScope, isTracked, lookupSymbol } from './scope.ts';
import type { Scope } from './scope.ts';

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
      /** The strings the key may be, when it is a name that holds one of a known set. */
      keys: readonly string[] | undefined;
      /** The member access with the computed key, and what it sits in. */
      member: Node;
      memberParent: Node | undefined;
    };

/** The strings that the computed key of `access` may be, when it is a known set. */
export function computedKeys(access: Node, scope: Scope): readonly string[] | undefined {
  return access.type === 'MemberExpression' && access.computed
    ? keysOf(access.property, scope)
    : undefined;
}

/** The name that holds the key of `obj[key]`, with the scope that declares it. */
export type ComputedKey = { name: string; scope: Scope };

export function computedKey(access: Node, scope: Scope): ComputedKey | undefined {
  const property =
    access.type === 'MemberExpression' && access.computed ? strip(access.property) : undefined;
  return property?.type === 'Identifier'
    ? { name: property.name, scope: declaringScope(scope, property.name) }
    : undefined;
}

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
      const names = computedKeys(parent, scope);
      // A name that holds one string is that string.
      const key =
        staticKey(parent.property, parent.computed) ?? (names?.length === 1 ? names[0] : undefined);
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
          keys: names,
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

const isNull = (node: Node): boolean => node.type === 'Literal' && node.value === null;
const isUndefined = (node: Node): boolean =>
  node.type === 'Identifier' && node.name === 'undefined';

/** Whether a test is true when `name` holds nothing: `!x`, `x == null`, or `typeof x !== 'function'`. */
function testsMissing(test: Node, name: string): boolean {
  const isName = (node: Node): boolean => node.type === 'Identifier' && node.name === name;
  const inner = strip(test);
  if (inner.type === 'UnaryExpression') {
    return inner.operator === '!' && isName(strip(inner.argument));
  }
  if (inner.type !== 'BinaryExpression') {
    return false;
  }
  const [left, right] = [strip(inner.left), strip(inner.right)];
  if (
    left.type === 'UnaryExpression' &&
    left.operator === 'typeof' &&
    isName(strip(left.argument))
  ) {
    const text = stringLiteral(right);
    return isInequality(inner.operator) ? text === 'function' : text === 'undefined';
  }
  const [other] = isName(left) ? [right] : isName(right) ? [left] : [];
  // `undefined === null` is false, so only a loose comparison with `null` finds a missing member.
  return (
    other !== undefined &&
    isEquality(inner.operator) &&
    (isUndefined(other) || (inner.operator === '==' && isNull(other)))
  );
}

/** Whether a branch sets `name`: `x = fallback;` or a block that holds it. */
function setsName(branch: Node, name: string): boolean {
  const statements = branch.type === 'BlockStatement' ? branch.body : [branch];
  return statements.some(statement => {
    const write =
      statement.type === 'ExpressionStatement' ? strip(statement.expression) : undefined;
    return (
      write?.type === 'AssignmentExpression' &&
      write.operator === '=' &&
      write.left.type === 'Identifier' &&
      write.left.name === name
    );
  });
}

/** The name that `let x = value` or `x = value` sets, when it is the only thing its statement does. */
function assignedName(node: Node, parent: Node, statement: Node | undefined): string | undefined {
  if (parent.type === 'AssignmentExpression') {
    return parent.operator === '=' && parent.right === node && parent.left.type === 'Identifier'
      ? parent.left.name
      : undefined;
  }
  return parent.type === 'VariableDeclarator' &&
    parent.init === node &&
    parent.id.type === 'Identifier' &&
    statement?.type === 'VariableDeclaration' &&
    statement.declarations.length === 1
    ? parent.id.name
    : undefined;
}

/**
 * Whether `node` is the value of `x = obj[key];` or `let x = obj[key];` and the next statement is
 * `if (typeof x !== 'function') x = fallback;`. This is `obj[key] || fallback` in two statements:
 * a missing member gives `undefined` and the fallback replaces it.
 */
function isFallbackRead(node: Node, parent: Node, outer: readonly Node[]): boolean {
  const [statement, container] = outer;
  const name = assignedName(node, parent, statement);
  const body =
    container?.type === 'BlockStatement' || container?.type === 'Program'
      ? (container.body as readonly Node[])
      : undefined;
  const next = statement === undefined ? undefined : body?.[body.indexOf(statement) + 1];
  return (
    name !== undefined &&
    next?.type === 'IfStatement' &&
    next.alternate === null &&
    testsMissing(next.test, name) &&
    setsName(next.consequent, name)
  );
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
