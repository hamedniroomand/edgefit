import type { Node } from 'oxc-parser';

import { isEquality, rootName, strip } from './ast.ts';
import { resolveBinding } from './bindings.ts';
import type { BindingContext } from './bindings.ts';
import type { AbsentGuard, ApiGuard, GlobalGuard, Guard } from './guard-stack.ts';
import { memberRef, normalizeRef } from './refs.ts';
import { globalName } from './runtimes.ts';
import { isParameter, isTracked, lookup } from './scope.ts';
import type { Scope } from './scope.ts';

/** The guard that says `node`, or its member `key`, exists. */
export function guardFor(node: Node, context: BindingContext, key?: string): ApiGuard[] {
  const binding = resolveBinding(node, context);
  if (!isTracked(binding)) {
    return [];
  }
  const name = rootName(node);
  const ref = normalizeRef(key === undefined ? binding.ref : memberRef(binding.ref, key));
  const local = name !== undefined && lookup(context.scope, name) !== undefined;
  return [{ kind: 'api', ref, root: local ? name : undefined, active: true }];
}

/** The guard that says `node`, or its member `key`, is missing. */
export function absentGuard(node: Node, context: BindingContext, key?: string): AbsentGuard[] {
  const binding = resolveBinding(node, context);
  if (!isTracked(binding)) {
    return [];
  }
  return [
    {
      kind: 'absent',
      ref: normalizeRef(key === undefined ? binding.ref : memberRef(binding.ref, key)),
    },
  ];
}

/** The guard that says the global `node`, or its member `key`, is there or is not. */
export function globalGuard(
  node: Node,
  present: boolean,
  context: BindingContext,
  key?: string,
): GlobalGuard[] {
  const name = globalName(node, context, key);
  return name === undefined ? [] : [{ kind: 'global', condition: { name, present } }];
}

// A member of a parameter is any input, such as a request. Only the options object holds the
// choice of the user of the package.
const optionsName = /^(?:options?|opts?|config|cfg|settings)$|(?:Options|Opts|Config|Settings)$/u;

/** The option that `options.name` reads, when `options` is a parameter of a function. */
function optionOf(node: Node, scope: Scope): string | undefined {
  const inner = strip(node);
  if (inner.type !== 'MemberExpression' || inner.computed || inner.property.type !== 'Identifier') {
    return undefined;
  }
  const object = strip(inner.object);
  return object.type === 'Identifier' &&
    optionsName.test(object.name) &&
    isParameter(scope, object.name)
    ? inner.property.name
    : undefined;
}

/**
 * What a test of an option says: `options.name` or `options.name === true` says the option is set
 * when it is true. A failed test says nothing, since the option can be unset in many ways.
 */
export function optionGuards(node: Node, truth: boolean, scope: Scope): Guard[] {
  if (!truth) return [];
  const test = strip(node);
  let name = optionOf(test, scope);
  if (test.type === 'BinaryExpression' && isEquality(test.operator)) {
    const [left, right] = [strip(test.left), strip(test.right)];
    const isTrue = (side: Node): boolean => side.type === 'Literal' && side.value === true;
    if (isTrue(right) || isTrue(left)) {
      name = optionOf(isTrue(right) ? left : right, scope);
    }
  }
  return name === undefined ? [] : [{ kind: 'option', name }];
}
