import type { Node } from 'oxc-parser';

import { staticKey, strip, stringLiteral } from './ast.ts';
import type { NodeOf } from './ast.ts';
import type { BindingContext } from './bindings.ts';
import { heldCheck } from './checks.ts';
import type { Guard } from './guard-stack.ts';

/** The name of a helper that `node` calls with no arguments: `isDeno()` or `Monitor.isAvailable()`. */
export function calleeName(node: Node): string | undefined {
  if (node.type !== 'CallExpression' || node.arguments.length > 0) {
    return undefined;
  }
  const callee = strip(node.callee);
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  const key =
    callee.type === 'MemberExpression' ? staticKey(callee.property, callee.computed) : undefined;
  return callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    key !== undefined
    ? `${callee.object.name}.${key}`
    : undefined;
}

/**
 * What `helper() === 'deno'` tells when `helper` returns `'deno'` only behind one test: that the
 * test was true. The call can also be held in a `const`, as in
 * `const platform = getPlatform(); if (platform === 'deno')`.
 */
export function valueGuard(
  node: NodeOf<'BinaryExpression'>,
  equal: boolean,
  context: BindingContext,
  guardsWhen: (test: Node, truth: boolean, context: BindingContext) => Guard[],
): Guard[] | undefined {
  const right = stringLiteral(node.right);
  const value = right ?? stringLiteral(node.left);
  if (!equal || value === undefined) {
    return undefined;
  }
  let call = strip(right === undefined ? node.right : node.left);
  let scope = context.scope;
  if (call.type === 'Identifier') {
    const held = heldCheck(scope, call.name);
    if (held === undefined || held.call) {
      return undefined;
    }
    call = strip(held.test);
    scope = held.scope;
  }
  const name = calleeName(call);
  const helper = name === undefined ? undefined : heldCheck(scope, name);
  const test = helper?.call === true ? helper.values?.get(value) : undefined;
  if (helper === undefined || test === undefined || helper.busy) {
    return undefined;
  }
  // A test that compares the helper's own result would call it again.
  helper.busy = true;
  try {
    return guardsWhen(test, true, { ...context, scope: helper.scope });
  } finally {
    helper.busy = false;
  }
}
