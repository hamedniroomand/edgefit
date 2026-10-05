import type { Node } from 'oxc-parser';

import { strip } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { foldedString } from './bindings.ts';
import type { BindingContext } from './bindings.ts';
import { computedKey } from './chain.ts';
import type { ApiGuard, Guard } from './guard-stack.ts';
import { guardsWhen } from './guards.ts';
import { createScope, lookupKeys } from './scope.ts';
import type { Scope } from './scope.ts';

const jumps = new Set(['ReturnStatement', 'ThrowStatement', 'ContinueStatement', 'BreakStatement']);

/** Whether a branch always leaves the code around it, so what follows only runs without it. */
export function leaves(statement: Node): boolean {
  if (jumps.has(statement.type)) {
    return true;
  }
  return statement.type === 'BlockStatement' && statement.body.some(inner => jumps.has(inner.type));
}

function isConstant(node: Node): boolean {
  return node.type === 'Literal' || (node.type === 'Identifier' && node.name === 'undefined');
}

/** The member a test checks: `obj[key]` in `!obj[key]`, `typeof obj[key] !== 'function'` or `obj[key] == null`. */
function testedMember(test: Node): Node | undefined {
  const inner = strip(test);
  if (inner.type === 'UnaryExpression' && (inner.operator === '!' || inner.operator === 'typeof')) {
    return testedMember(inner.argument);
  }
  if (inner.type === 'BinaryExpression') {
    const [left, right] = [strip(inner.left), strip(inner.right)];
    if (isConstant(right)) {
      return testedMember(left);
    }
    return isConstant(left) ? testedMember(right) : undefined;
  }
  return inner.type === 'MemberExpression' ? inner : undefined;
}

/** The strings a branch gives to `name`, when all it does is give strings to `name`: `{ m = 'log'; }`. */
function fallbackStrings(branch: Node, name: string, scope: Scope): string[] | undefined {
  const statements = branch.type === 'BlockStatement' ? branch.body : [branch];
  const values = statements.map(statement => {
    const write =
      statement.type === 'ExpressionStatement' ? strip(statement.expression) : undefined;
    return write?.type === 'AssignmentExpression' &&
      write.operator === '=' &&
      write.left.type === 'Identifier' &&
      write.left.name === name
      ? foldedString(write.right, scope)
      : undefined;
  });
  return values.length > 0 && values.every(value => value !== undefined)
    ? (values as string[])
    : undefined;
}

/**
 * `if (!console[m]) m = 'log';` leaves `m` on a member that exists, or on the fallback. So a read
 * of `console[m]` after it is guarded for each other string that `m` may hold.
 */
function fallbackGuards(node: NodeOf<'IfStatement'>, context: BindingContext): ApiGuard[] {
  const member = testedMember(node.test);
  const key = member === undefined ? undefined : computedKey(member, context.scope);
  const keys = key === undefined ? undefined : lookupKeys(context.scope, key.name);
  const fallbacks =
    key === undefined || node.alternate !== null
      ? undefined
      : fallbackStrings(node.consequent, key.name, context.scope);
  if (key === undefined || keys === undefined || fallbacks === undefined) {
    return [];
  }
  const scope = createScope(context.scope);
  scope.keys.set(
    key.name,
    keys.filter(name => !fallbacks.includes(name)),
  );
  const guards = guardsWhen(node.test, false, { ...context, scope }).filter(
    (guard): guard is ApiGuard => guard.kind === 'api',
  );
  for (const guard of guards) {
    guard.key = key;
  }
  return guards;
}

/** Guards for the statements after an `if` where one branch always leaves, or that sets a fallback key. */
export function guardsAfter(node: NodeOf<'IfStatement'>, context: BindingContext): Guard[] {
  const consequent = leaves(node.consequent);
  const alternate = node.alternate !== null && leaves(node.alternate);
  if (consequent === alternate) {
    return consequent ? [] : fallbackGuards(node, context);
  }
  return guardsWhen(node.test, alternate, context);
}
