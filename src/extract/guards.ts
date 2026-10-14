import type { Node } from 'oxc-parser';

import {
  absentGuard,
  globalGuard,
  guardFor,
  isNullish,
  moduleGuards,
  optionalObject,
  optionGuards,
  runtimeGuard,
  withoutLooksMissing,
} from './api-guards.ts';
import { isEquality, isInequality, strip, stringLiteral } from './ast.ts';
import type { NodeOf } from './ast.ts';
import type { BindingContext } from './bindings.ts';
import { computedKey, computedKeys } from './chain.ts';
import { heldCheck } from './checks.ts';
import { constantOf } from './constants.ts';
import type { Guard } from './guard-stack.ts';
import {
  agentRuntime,
  isUnbound,
  markerType,
  memberRuntime,
  nextRuntimeEdge,
  nodeEnvMatches,
  mainModuleMatches,
  runtimeMarker,
} from './runtimes.ts';

/**
 * What a check of `obj[key]` says when `key` may be one of several strings: each member, but only
 * for a read through the same `key`, since the check does not say which one it was. A failed
 * check says nothing, since it does not say which member is missing.
 */
function keyedPresence(
  node: NodeOf<'MemberExpression'>,
  names: readonly string[],
  present: boolean,
  context: BindingContext,
): Guard[] {
  const key = computedKey(node, context.scope);
  if (key === undefined || !present) {
    return [];
  }
  const guards = names.flatMap(name => guardFor(node.object, context, name));
  for (const guard of guards) {
    guard.key = key;
  }
  return guards;
}

/**
 * What is known when `node` exists (`present`) or does not. The marker of a runtime says
 * which runtime this is either way; any other API only says something when it exists.
 */
function presence(node: Node, present: boolean, context: BindingContext, key?: string): Guard[] {
  const names = key === undefined ? computedKeys(node, context.scope) : undefined;
  if (names !== undefined && node.type === 'MemberExpression') {
    return names.length === 1
      ? presence(node.object, present, context, names[0])
      : keyedPresence(node, names, present, context);
  }
  const runtime =
    key === undefined ? runtimeMarker(node, context) : memberRuntime(node, key, context);
  const api = present ? guardFor(node, context, key) : absentGuard(node, context, key);
  // A runtime marker such as `Deno` already says which runtime this is.
  const global = runtime === undefined ? globalGuard(node, present, context, key) : [];
  return [...api, ...runtimeGuard(runtime, present), ...global];
}

function typeofGuard(
  node: NodeOf<'BinaryExpression'>,
  truth: boolean,
  context: BindingContext,
): Guard[] | undefined {
  const [operand, literal] =
    strip(node.left).type === 'UnaryExpression' ? [node.left, node.right] : [node.right, node.left];
  const call = strip(operand);
  const text = stringLiteral(literal);
  if (call.type !== 'UnaryExpression' || call.operator !== 'typeof' || text === undefined) {
    return undefined;
  }
  const equal = isEquality(node.operator) ? truth : !truth;
  // A runtime marker has a known type, so `typeof EdgeRuntime !== 'string'` says it is missing.
  const known = markerType(call.argument, context);
  if (known !== undefined && text === known) {
    return presence(call.argument, equal, context);
  }
  const exists = equal ? text !== 'undefined' : text === 'undefined';
  if (exists) {
    return presence(call.argument, true, context);
  }
  // Only `typeof x === 'undefined'` says the value is missing; `!== 'string'` says nothing.
  return equal ? withoutLooksMissing(presence(call.argument, false, context), false) : [];
}

function comparisonGuard(
  node: NodeOf<'BinaryExpression'>,
  truth: boolean,
  context: BindingContext,
): Guard[] | undefined {
  if (!isEquality(node.operator) && !isInequality(node.operator)) {
    return undefined;
  }
  const equal = isEquality(node.operator) ? truth : !truth;
  const main = mainModuleMatches(node, context);
  if (main !== undefined) {
    return main === equal ? [] : [{ kind: 'dead', main: true }];
  }
  const matches = nodeEnvMatches(node, context);
  if (matches !== undefined) {
    return matches === equal ? [] : [{ kind: 'dead' }];
  }
  const typed = typeofGuard(node, truth, context);
  if (typed !== undefined) {
    return typed;
  }
  const agent = agentRuntime(node, context);
  if (agent !== undefined) {
    return runtimeGuard(agent, equal);
  }
  const edge = nextRuntimeEdge(node, context);
  if (edge !== undefined) {
    return runtimeGuard('vercel-edge', equal === edge);
  }
  const left = isNullish(node.left);
  if (!left && !isNullish(node.right)) {
    return undefined;
  }
  const known = withoutLooksMissing(
    presence(left ? node.right : node.left, !equal, context),
    false,
  );
  // `!= null`, `!= undefined` and `!== null` rule out `null`; `!== undefined` does not.
  const loose = node.operator === '==' || node.operator === '!=';
  const rulesOutNull = loose || strip(left ? node.left : node.right).type === 'Literal';
  return !equal && rulesOutNull ? [...known, ...moduleGuards(known)] : known;
}

/** What a call of a helper, or a read of a `const`, tells: the facts of the check it holds. */
function checkGuards(
  node: Node,
  truth: boolean,
  context: BindingContext,
  nullish: boolean,
): Guard[] {
  let name: string | undefined;
  if (node.type === 'Identifier') {
    name = node.name;
  } else if (node.type === 'CallExpression' && node.arguments.length === 0) {
    const callee = strip(node.callee);
    name = callee.type === 'Identifier' ? callee.name : undefined;
  }
  const check = name === undefined ? undefined : heldCheck(context.scope, name);
  if (check === undefined || check.call !== (node.type === 'CallExpression') || check.busy) {
    return [];
  }
  check.busy = true;
  try {
    return guardsWhen(
      check.test,
      check.negated ? !truth : truth,
      {
        imported: context.imported,
        scope: check.scope,
        globals: context.globals,
        nodeEnv: context.nodeEnv,
        wrappers: context.wrappers,
      },
      nullish,
    );
  } finally {
    check.busy = false;
  }
}

/** What a call as a test tells, or `undefined` when it tells nothing by itself. */
function callGuards(
  node: NodeOf<'CallExpression'>,
  truth: boolean,
  context: BindingContext,
): Guard[] | undefined {
  const [only] = node.arguments;
  // `Boolean(x)` is truthy exactly when `x` is.
  if (
    node.arguments.length === 1 &&
    only?.type !== 'SpreadElement' &&
    only !== undefined &&
    strip(node.callee).type === 'Identifier' &&
    isUnbound(strip(node.callee), 'Boolean', context)
  ) {
    return guardsWhen(only, truth, context);
  }
  const agent = agentRuntime(node, context);
  if (agent !== undefined) {
    return runtimeGuard(agent, truth);
  }
  // `f?.()` is truthy only when `f` exists and was called.
  return node.optional && truth ? guardsWhen(node.callee, true, context) : undefined;
}

/**
 * Both sides of `a && b` or `a || b` are known only when they all had to hold: `a && b` true,
 * `a || b` false. A nullish `a || b` has a falsy `a` and a nullish `b`.
 */
function logicalGuards(
  node: NodeOf<'LogicalExpression'>,
  truth: boolean,
  context: BindingContext,
  nullish: boolean,
): Guard[] {
  return truth === (node.operator === '&&')
    ? [...guardsWhen(node.left, truth, context), ...guardsWhen(node.right, truth, context, nullish)]
    : [];
}

/**
 * The APIs that must exist, and what is known of the runtime, whenever `test` evaluates to `truth`.
 * With `nullish`, a false `test` means that its value is `null` or `undefined`, as on the left of `??`.
 */
export function guardsWhen(
  test: Node,
  truth: boolean,
  context: BindingContext,
  nullish = false,
): Guard[] {
  const node = strip(test);
  const constant = constantOf(node);
  if (constant !== undefined) {
    return Boolean(constant.value) === truth ? [] : [{ kind: 'dead' }];
  }
  if (node.type === 'UnaryExpression' && node.operator === '!') {
    return guardsWhen(node.argument, !truth, context);
  }
  if (node.type === 'LogicalExpression' && node.operator !== '??') {
    return logicalGuards(node, truth, context, nullish);
  }
  if (node.type === 'BinaryExpression') {
    if (node.operator === 'in') {
      const key = stringLiteral(node.left);
      return key === undefined ? [] : presence(node.right, truth, context, key);
    }
    return comparisonGuard(node, truth, context) ?? optionGuards(node, truth, context.scope);
  }
  if (node.type === 'CallExpression') {
    const guards = callGuards(node, truth, context);
    if (guards !== undefined) {
      return guards;
    }
  }
  const known = withoutLooksMissing(presence(node, truth, context), !nullish);
  return [
    ...checkGuards(node, truth, context, nullish),
    ...known,
    ...(truth ? moduleGuards(known) : []),
    ...optionalObject(node, truth, context),
    ...optionGuards(node, truth, context.scope),
  ];
}
