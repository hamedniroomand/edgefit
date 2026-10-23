import type { Node } from 'oxc-parser';

import type { ApiRef, PassedKey } from '@/types.ts';

import { invokers, isSymbolKey, staticKey, strip, unwrap } from './ast.ts';
import { resolveBinding } from './bindings.ts';
import type { BindingContext } from './bindings.ts';
import { isFallbackRead } from './fallback-reads.ts';
import { keysOf, passedKeysOf } from './known-values.ts';
import { memberRef, passesOn } from './refs.ts';
import { declaringScope, isTracked, lookupPresent, lookupSymbol } from './scope.ts';
import type { Scope } from './scope.ts';

export { isOptionalRead } from './optional-reads.ts';
export { isSafeRead } from './safe-reads.ts';

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

/**
 * Whether the value of `node` only goes back to the caller: `return x`, or the body of `() => x`,
 * through wrappers such as `(x)`, `x!` and `(0, x)`. `await x` is not one of these, so a read that is
 * awaited stays unknown.
 * `outer` holds the ancestors above `parent`, nearest first.
 */
export function isReturned(node: Node, parent: Node, outer: readonly Node[]): boolean {
  let value = node;
  for (const ancestor of [parent, ...outer]) {
    if (ancestor.type === 'ReturnStatement') {
      return true;
    }
    // The walker gives the default value of a parameter the arrow function as its parent, so only
    // the body counts.
    if (ancestor.type === 'ArrowFunctionExpression') {
      return ancestor.body === value;
    }
    if (ancestor.type === 'AwaitExpression' || !passesOn(ancestor, value)) {
      return false;
    }
    value = ancestor;
  }
  return false;
}

/**
 * Whether `obj[name]` reads a key that an `in` test on `obj` proved present. As for `||`, a read
 * that is called in place or read further is not covered: a present member that throws still fails.
 */
export function isPresentRead(access: Node, parent: Node | undefined, scope: Scope): boolean {
  if (access.type !== 'MemberExpression' || !access.computed) return false;
  const key = strip(access.property);
  const object = strip(access.object);
  if (key.type !== 'Identifier' || object.type !== 'Identifier') return false;
  const used =
    (parent?.type === 'CallExpression' && strip(parent.callee) === access) ||
    (parent?.type === 'MemberExpression' && strip(parent.object) === access);
  const entry = lookupPresent(scope, key.name);
  return (
    !used &&
    entry !== undefined &&
    entry.object === object.name &&
    entry.scope === declaringScope(scope, object.name)
  );
}

/** The call or `new` that has `node` as its callee. `outer` holds the ancestors above `parent`, nearest first. */
function callOf(node: Node, parent: Node | undefined, outer: readonly Node[]): Node | undefined {
  const ancestors = [parent, ...outer];
  let value = node;
  let index = 0;
  for (let current = ancestors[0]; current !== undefined && passesOn(current, value);) {
    value = current;
    index += 1;
    current = ancestors[index];
  }
  const call = ancestors[index];
  return (call?.type === 'CallExpression' || call?.type === 'NewExpression') &&
    call.callee === value
    ? call
    : undefined;
}

/**
 * The keys that a call of `node` passes in its options: the last argument that is an object literal
 * or a name that holds one, as in `connect(port, host, options, callback)` or
 * `new TLSSocket(socket, options)`. A spread argument hides which argument holds the options.
 */
export function callPassedKeys(
  node: Node,
  parent: Node | undefined,
  outer: readonly Node[],
  scope: Scope,
): PassedKey[] | undefined {
  const call = callOf(node, parent, outer);
  if (
    (call?.type !== 'CallExpression' && call?.type !== 'NewExpression') ||
    call.arguments.some(argument => argument.type === 'SpreadElement')
  ) {
    return undefined;
  }
  const options = call.arguments
    .map(argument => passedKeysOf(argument, scope))
    .findLast(keys => keys !== undefined);
  return options === undefined || options.length === 0 ? undefined : [...options];
}
