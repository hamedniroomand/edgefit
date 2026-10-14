import type { Node } from 'oxc-parser';

import type { ApiRef, Runtime } from '@/types.ts';

import { isEquality, rootName, strip } from './ast.ts';
import { resolveBinding } from './bindings.ts';
import type { BindingContext } from './bindings.ts';
import type { AbsentGuard, ApiGuard, GlobalGuard, Guard } from './guard-stack.ts';
import { memberRef, normalizeRef } from './refs.ts';
import { globalName } from './runtimes.ts';
import { isParameter, isTracked, lookup } from './scope.ts';
import type { Scope } from './scope.ts';

/** A value that only a module sets, so a truthy value shows that the module exists. */
const setByModule: Record<string, ApiRef> = {
  'process.domain': { module: 'domain', path: [] },
};

/**
 * The module that a set value shows. Only a set value counts: Node.js sets `process.domain` to
 * `null` before the module loads, so `typeof`, `in` and `!== undefined` checks pass without it.
 */
export function moduleGuards(guards: readonly Guard[]): Guard[] {
  return guards.flatMap(guard => {
    if (guard.kind !== 'api') {
      return [];
    }
    const module = setByModule[[guard.ref.module, ...guard.ref.path].join('.')];
    return module === undefined ? [] : [{ ...guard, ref: module }];
  });
}

/** `a?.b` is truthy only when `a` exists too, so the object is known as well as the member. */
export function optionalObject(node: Node, truth: boolean, context: BindingContext): Guard[] {
  return truth && node.type === 'MemberExpression' && node.optional
    ? guardFor(node.object, context)
    : [];
}

export function isNullish(node: Node): boolean {
  const inner = strip(node);
  return (
    (inner.type === 'Identifier' && inner.name === 'undefined') ||
    (inner.type === 'Literal' && inner.value === null && inner.raw === 'null') ||
    (inner.type === 'UnaryExpression' && inner.operator === 'void')
  );
}

export function runtimeGuard(runtime: Runtime | undefined, present: boolean): Guard[] {
  return runtime === undefined ? [] : [{ kind: 'runtime', condition: { runtime, present } }];
}

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

/**
 * Whether a value test sees the global `name` as missing although it exists: `NaN` is falsy, and
 * `undefined` is also nullish and of type `undefined`. `truthiness` is true for a test that only
 * reads truthiness.
 */
export const looksMissing = (name: string, truthiness: boolean): boolean =>
  name === 'undefined' || (truthiness && name === 'NaN');

/**
 * Drops the guards that say a global is missing when it exists and only looks missing:
 * `undefined`, and `NaN` for a truthiness test.
 */
export function withoutLooksMissing(guards: Guard[], truthiness: boolean): Guard[] {
  return guards.filter(guard => {
    let name: string | undefined;
    if (guard.kind === 'global' && !guard.condition.present) {
      name = guard.condition.name;
    } else if (guard.kind === 'absent' && guard.ref.module === '*globals*') {
      name = guard.ref.path.length === 1 ? guard.ref.path[0] : undefined;
    }
    return name === undefined || !looksMissing(name, truthiness);
  });
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
