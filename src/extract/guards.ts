import type { Node } from 'oxc-parser';

import type { ApiRef } from '@/types.ts';

import { unwrap } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { resolveBinding } from './bindings.ts';
import type { BindingContext } from './bindings.ts';
import { normalizeRef, memberRef } from './refs.ts';
import { isTracked, lookup } from './scope.ts';

/** An API that is known to exist inside the code a check protects. */
export interface Guard {
  ref: ApiRef;
  /** The local name the check started from, so reassigning it can end the guard. */
  root: string | undefined;
  active: boolean;
}

const jumps = new Set(['ReturnStatement', 'ThrowStatement', 'ContinueStatement', 'BreakStatement']);

function strip(node: Node): Node {
  let current = node;
  for (let inner = unwrap(current); inner !== undefined; inner = unwrap(current)) {
    current = inner;
  }
  return current;
}

function rootName(node: Node): string | undefined {
  const inner = strip(node);
  if (inner.type === 'MemberExpression') {
    return rootName(inner.object);
  }
  return inner.type === 'Identifier' ? inner.name : undefined;
}

function guardFor(node: Node, context: BindingContext, key?: string): Guard[] {
  const binding = resolveBinding(node, context);
  if (!isTracked(binding)) {
    return [];
  }
  const name = rootName(node);
  const ref = normalizeRef(key === undefined ? binding.ref : memberRef(binding.ref, key));
  const local = name !== undefined && lookup(context.scope, name) !== undefined;
  return [{ ref, root: local ? name : undefined, active: true }];
}

function isNullish(node: Node): boolean {
  const inner = strip(node);
  return (
    (inner.type === 'Identifier' && inner.name === 'undefined') ||
    (inner.type === 'Literal' && inner.value === null && inner.raw === 'null') ||
    (inner.type === 'UnaryExpression' && inner.operator === 'void')
  );
}

function stringLiteral(node: Node): string | undefined {
  const inner = strip(node);
  return inner.type === 'Literal' && typeof inner.value === 'string' ? inner.value : undefined;
}

function isEquality(operator: string): boolean {
  return operator === '==' || operator === '===';
}

function isInequality(operator: string): boolean {
  return operator === '!=' || operator === '!==';
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
  const exists = equal ? text !== 'undefined' : text === 'undefined';
  return exists ? guardFor(call.argument, context) : [];
}

function comparisonGuard(
  node: NodeOf<'BinaryExpression'>,
  truth: boolean,
  context: BindingContext,
): Guard[] | undefined {
  if (!isEquality(node.operator) && !isInequality(node.operator)) {
    return undefined;
  }
  const typed = typeofGuard(node, truth, context);
  if (typed !== undefined) {
    return typed;
  }
  const left = isNullish(node.left);
  if (!left && !isNullish(node.right)) {
    return undefined;
  }
  const equal = isEquality(node.operator) ? truth : !truth;
  return equal ? [] : guardFor(left ? node.right : node.left, context);
}

/** The APIs that must exist whenever `test` evaluates to `truth`. */
export function guardsWhen(test: Node, truth: boolean, context: BindingContext): Guard[] {
  const node = strip(test);
  if (node.type === 'UnaryExpression' && node.operator === '!') {
    return guardsWhen(node.argument, !truth, context);
  }
  if (node.type === 'LogicalExpression' && node.operator !== '??') {
    // Both sides are known only when they all had to hold: `a && b` true, `a || b` false.
    if (truth === (node.operator === '&&')) {
      return [...guardsWhen(node.left, truth, context), ...guardsWhen(node.right, truth, context)];
    }
    return [];
  }
  if (node.type === 'BinaryExpression') {
    if (node.operator === 'in') {
      const key = stringLiteral(node.left);
      return truth && key !== undefined ? guardFor(node.right, context, key) : [];
    }
    return comparisonGuard(node, truth, context) ?? [];
  }
  return truth ? guardFor(node, context) : [];
}

/** Whether `ref` is `guard.ref` or something below it. */
function isCovered(guard: Guard, ref: ApiRef): boolean {
  const target = normalizeRef(ref);
  return (
    guard.active &&
    guard.ref.module === target.module &&
    guard.ref.path.every((segment, index) => target.path[index] === segment)
  );
}

/** Whether a branch always leaves the code around it, so what follows only runs without it. */
export function leaves(statement: Node): boolean {
  if (jumps.has(statement.type)) {
    return true;
  }
  return statement.type === 'BlockStatement' && statement.body.some(inner => jumps.has(inner.type));
}

/** Guards for the statements after an `if` where one branch always leaves. */
export function guardsAfter(node: NodeOf<'IfStatement'>, context: BindingContext): Guard[] {
  const consequent = leaves(node.consequent);
  const alternate = node.alternate !== null && leaves(node.alternate);
  if (consequent === alternate) {
    return [];
  }
  return guardsWhen(node.test, alternate, context);
}

/** The guards in force at the point being visited. */
export class GuardStack {
  readonly #guards: Guard[] = [];

  /** Runs `body` with `guards` added, and removes them afterwards. */
  public readonly within = (guards: readonly Guard[], body: () => void): void => {
    const depth = this.#guards.length;
    this.#guards.push(...guards);
    try {
      body();
    } finally {
      this.#guards.length = depth;
    }
  };

  /** Runs `body`, which may add guards that last for the rest of a block. */
  public readonly scoped = (body: (add: (guards: readonly Guard[]) => void) => void): void => {
    const depth = this.#guards.length;
    try {
      body(guards => {
        this.#guards.push(...guards);
      });
    } finally {
      this.#guards.length = depth;
    }
  };

  public readonly drop = (name: string): void => {
    for (const guard of this.#guards) {
      if (guard.root === name) {
        guard.active = false;
      }
    }
  };

  public readonly covers = (ref: ApiRef): boolean =>
    this.#guards.some(guard => isCovered(guard, ref));
}
