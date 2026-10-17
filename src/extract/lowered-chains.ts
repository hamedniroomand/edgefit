import { visitorKeys } from 'oxc-parser';
import type { Node } from 'oxc-parser';

import { chainTemps, staticKey } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { isTemp, nullishOf, parens, tempOf, testOf } from './lowered-tests.ts';
import type { Temp } from './lowered-tests.ts';
import { isStatementUse } from './statement-use.ts';

/** The object `W` of the member `V = W.y`, also when `V` is the chain of an inner form. */
function objectOf(value: Node): Node | undefined {
  let inner = parens(value);
  if (inner.type === 'ChainExpression') {
    inner = parens(inner.expression);
  }
  return inner.type === 'MemberExpression' ? parens(inner.object) : undefined;
}

/**
 * Whether `thisArg` of `t.call(thisArg, …)`, which a compiler writes for `V?.()`, is the object
 * of `V`: the temp `u` of `(u = W).y`, or the same name. The temp is marked, so it passes its
 * value on.
 */
function isObjectOf(thisArg: Node | undefined, value: Node): boolean {
  const object = objectOf(value);
  const name = thisArg === undefined ? undefined : parens(thisArg);
  if (object === undefined || name?.type !== 'Identifier') {
    return false;
  }
  const temp = tempOf(object);
  if (temp?.assignment !== undefined && temp.name === name.name) {
    chainTemps.add(temp.assignment);
    return true;
  }
  return object.type === 'Identifier' && object.name === name.name;
}

/** Whether `callee` is `t.call`, with `t` the temp of the form. */
function isCallOf(callee: Node, temp: Temp): boolean {
  const inner = parens(callee);
  return (
    inner.type === 'MemberExpression' &&
    !inner.computed &&
    inner.property.type === 'Identifier' &&
    inner.property.name === 'call' &&
    isTemp(inner.object, temp)
  );
}

/**
 * Makes `use` a chain on `(t = V)`: `t.y.z` gives `(t = V)?.y.z`, and `t.call(o, x)` gives
 * `(t = V)?.(x)` when `o` is the object of `V`. Returns whether it did: nothing changes when `use`
 * does not start with `t`.
 */
function rebase(use: Node, temp: Temp): boolean {
  const inner = parens(use);
  if (inner.type === 'MemberExpression') {
    const object = parens(inner.object);
    if (
      object.type === 'AssignmentExpression' &&
      object.operator === '=' &&
      object.left.type === 'Identifier'
    ) {
      // `(u = t.y).z`: `u` is the receiver of a later `.call(u)`, so it passes its value on.
      const found = rebase(object.right, temp);
      if (found) chainTemps.add(object);
      return found;
    }
    if (!isTemp(inner.object, temp)) {
      return rebase(inner.object, temp);
    }
    inner.object = temp.node as typeof inner.object;
  } else if (inner.type === 'CallExpression') {
    const [thisArg, ...rest] = inner.arguments;
    if (
      temp.assignment === undefined ||
      !isCallOf(inner.callee, temp) ||
      !isObjectOf(thisArg, temp.assignment.right)
    ) {
      return rebase(inner.callee, temp);
    }
    inner.callee = temp.node as typeof inner.callee;
    inner.arguments = rest;
  } else {
    return false;
  }
  inner.optional = true;
  if (temp.assignment !== undefined) {
    chainTemps.add(temp.assignment);
  }
  return true;
}

function chainOf(use: Node, replaced: Node): Node {
  const expression = use as NodeOf<'ChainExpression'>['expression'];
  return { type: 'ChainExpression', expression, start: replaced.start, end: replaced.end };
}

/** Whether `receiver` names the temp that is the object of the last member of the restored chain `object`. */
function isReceiverOf(receiver: Node | undefined, object: Node): boolean {
  const chain = parens(object);
  const member = chain.type === 'ChainExpression' ? parens(chain.expression) : undefined;
  const base = member?.type === 'MemberExpression' ? parens(member.object) : undefined;
  return (
    base?.type === 'AssignmentExpression' &&
    base.left.type === 'Identifier' &&
    chainTemps.has(base) &&
    receiver?.type === 'Identifier' &&
    receiver.name === base.left.name
  );
}

/**
 * `(V?.y).call(t)`, which a compiler writes for `(V?.y)()` to keep `t` as `this`: the call of the
 * restored chain, without the receiver.
 */
function calledChain(node: NodeOf<'CallExpression'>): Node | undefined {
  const callee = parens(node.callee);
  const [receiver, ...rest] = node.arguments;
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property.type !== 'Identifier' ||
    callee.property.name !== 'call' ||
    !isReceiverOf(receiver, callee.object)
  ) {
    return undefined;
  }
  node.callee = callee.object;
  node.arguments = rest;
  return node;
}

/** Whether `value` is `x.y` or `x.y.z` on the plain name of `temp`, with static keys and no call. `rebase` refuses `x` alone. */
function isMemberChain(value: Node, temp: Temp): boolean {
  let inner = parens(value);
  while (inner.type === 'MemberExpression') {
    if (inner.optional || staticKey(inner.property, inner.computed) === undefined) {
      return false;
    }
    inner = parens(inner.object);
  }
  return isTemp(inner, temp);
}

/**
 * `x == null ? void 0 : x.y` on a plain name `x`, as `x?.y`. Only a statement that reads a member of
 * the value or calls it counts, as in `(x == null ? void 0 : x.y).z;`: that read throws when `x` is
 * missing. In any other place the compare stays a check, as a hand-written one is.
 */
function plainChain(
  node: NodeOf<'ConditionalExpression'>,
  test: { temp: Temp; present: boolean },
  ancestors: readonly Node[],
): Node | undefined {
  const [value, fallback] = test.present
    ? [node.consequent, node.alternate]
    : [node.alternate, node.consequent];
  return nullishOf(fallback) === 'undefined' &&
    isMemberChain(value, test.temp) &&
    isStatementUse(node, ancestors) &&
    rebase(value, test.temp)
    ? chainOf(value, node)
    : undefined;
}

/**
 * The source form of a compiled `V?.y` or `V ?? y`, or `undefined` when `node` is not one:
 * `(t = V) == null ? void 0 : t.y` gives `(t = V)?.y`, `(t = V) != null ? t : y` gives
 * `(t = V) ?? y`, the `(t = V) != null && t.y` of a minified test gives `(t = V)?.y`, and
 * `(V?.y).call(t)` gives `(V?.y)()`. The assignment stays, so `t` is still set, and passes its
 * value on.
 */
function restored(node: Node, ancestors: readonly Node[]): Node | undefined {
  if (node.type === 'CallExpression') {
    return calledChain(node);
  }
  if (node.type === 'LogicalExpression') {
    const test = node.operator === '&&' ? testOf(node.left) : undefined;
    // A hand-written `x != null && x.y()` on a plain name is a check, so only a temp counts.
    return test?.present === true &&
      test.temp.assignment !== undefined &&
      rebase(node.right, test.temp)
      ? chainOf(node.right, node)
      : undefined;
  }
  if (node.type !== 'ConditionalExpression') {
    return undefined;
  }
  const test = testOf(node.test);
  if (test === undefined) {
    return undefined;
  }
  if (test.temp.assignment === undefined) {
    return plainChain(node, test, ancestors);
  }
  const [value, fallback] = test.present
    ? [node.consequent, node.alternate]
    : [node.alternate, node.consequent];
  if (isTemp(value, test.temp)) {
    chainTemps.add(test.temp.assignment);
    const left = test.temp.node as NodeOf<'LogicalExpression'>['left'];
    return {
      type: 'LogicalExpression',
      operator: '??',
      left,
      right: fallback,
      start: node.start,
      end: node.end,
    };
  }
  return nullishOf(fallback) === 'undefined' && rebase(value, test.temp)
    ? chainOf(value, node)
    : undefined;
}

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && 'type' in value;

/**
 * Restores each `V?.y` and `V ?? y` that TypeScript, Babel or esbuild compiled for a target older
 * than ES2020, in place, so the walk reads the source form. Children first, so that nested
 * chains compose. Returns the node, or the node that replaces it.
 */
export function restoreChains(node: Node, ancestors: Node[] = []): Node {
  const record = node as unknown as Record<string, unknown>;
  ancestors.push(node);
  for (const key of visitorKeys[node.type] ?? []) {
    const value = record[key];
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        if (isNode(item)) {
          value[index] = restoreChains(item, ancestors);
        }
      }
    } else if (isNode(value)) {
      record[key] = restoreChains(value, ancestors);
    }
  }
  ancestors.pop();
  return restored(node, ancestors) ?? node;
}
