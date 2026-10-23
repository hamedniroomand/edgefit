import { visitorKeys } from 'oxc-parser';
import type { Node } from 'oxc-parser';

import { chainTemps, staticKey } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { chainOf, rebase } from './lowered-rebase.ts';
import { isTemp, nullishOf, parens, testOf } from './lowered-tests.ts';
import type { Temp } from './lowered-tests.ts';
import { isDiscarded, isStatementUse } from './statement-use.ts';

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
 * `(t = V) != null && t.y` and `(t = V) == null || t.y`, as `(t = V)?.y`.
 */
function testedChain(
  node: NodeOf<'LogicalExpression'>,
  ancestors: readonly Node[],
): Node | undefined {
  const present = node.operator === '&&';
  const test = present || node.operator === '||' ? testOf(node.left) : undefined;
  // A hand-written `x != null && x.y()` or `x == null || x.y()` on a plain name is a check, so
  // only a temp counts. The `(t = V) == null || t.y` of a minifier is `true` when `V` is missing,
  // so it is the chain only where its value is dropped.
  return test?.present === present &&
    test.temp.assignment !== undefined &&
    (present || isDiscarded(node, ancestors)) &&
    rebase(node.right, test.temp)
    ? chainOf(node.right, node)
    : undefined;
}

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && 'type' in value;

/** Whether `node` holds a name `name`. */
function mentions(node: Node, name: string): boolean {
  if (node.type === 'Identifier') {
    return node.name === name;
  }
  const record = node as unknown as Record<string, unknown>;
  return (visitorKeys[node.type] ?? []).some(key => {
    const value = record[key];
    const items = Array.isArray(value) ? value : [value];
    return items.some(item => isNode(item) && mentions(item, name));
  });
}

/**
 * `(t = V) != null || y()`, which a minifier writes for the statement `V ?? y()`, as
 * `(t = V) ?? y()`. Both run `y()` when `V` is missing, and the value is dropped.
 */
function nullishStatement(
  node: NodeOf<'LogicalExpression'>,
  ancestors: readonly Node[],
): Node | undefined {
  const test = node.operator === '||' ? testOf(node.left) : undefined;
  // The fallback of `V ?? y` cannot read the temp. A fallback that reads it is not a compiled `??`.
  if (
    test?.present !== true ||
    test.temp.assignment === undefined ||
    mentions(node.right, test.temp.name) ||
    !isDiscarded(node, ancestors)
  ) {
    return undefined;
  }
  chainTemps.add(test.temp.assignment);
  const left = test.temp.node as NodeOf<'LogicalExpression'>['left'];
  return {
    type: 'LogicalExpression',
    operator: '??',
    left,
    right: node.right,
    start: node.start,
    end: node.end,
  };
}

/**
 * `a || (t = V) == null || t.y`, which a minifier writes for `a || (V?.y)`, as `a || (t = V)?.y`.
 * `||` is associative, so `(a || b) || c` is `a || (b || c)`.
 */
function flatChain(
  node: NodeOf<'LogicalExpression'>,
  ancestors: readonly Node[],
): Node | undefined {
  const left = parens(node.left);
  if (node.operator !== '||' || left.type !== 'LogicalExpression' || left.operator !== '||') {
    return undefined;
  }
  const test = testOf(left.right);
  if (
    test?.present !== false ||
    test.temp.assignment === undefined ||
    !isDiscarded(node, ancestors) ||
    !rebase(node.right, test.temp)
  ) {
    return undefined;
  }
  const right = chainOf(node.right, node) as NodeOf<'LogicalExpression'>['right'];
  return {
    type: 'LogicalExpression',
    operator: '||',
    left: left.left,
    right,
    start: node.start,
    end: node.end,
  };
}

/** Whether `node` is `true` or its minified form `!0`, the value of `delete x?.y` when `x` is missing. */
function isTrue(node: Node): boolean {
  const inner = parens(node);
  const negated =
    inner.type === 'UnaryExpression' && inner.operator === '!' ? parens(inner.argument) : undefined;
  return (
    (inner.type === 'Literal' && inner.value === true) ||
    (negated?.type === 'Literal' && negated.value === 0)
  );
}

/**
 * `delete t.y` on the temp of a form, as `delete (t = V)?.y`. The form gives `true` when `V` is
 * missing, as `delete V?.y` does, so the value is the same wherever it goes.
 */
function deletedChain(use: Node, temp: Temp): Node | undefined {
  const deleted = parens(use);
  if (
    deleted.type !== 'UnaryExpression' ||
    deleted.operator !== 'delete' ||
    !rebase(deleted.argument, temp)
  ) {
    return undefined;
  }
  deleted.argument = chainOf(deleted.argument, deleted) as typeof deleted.argument;
  return deleted;
}

/** `(t = V) == null || delete t.y`, as `delete (t = V)?.y`. */
function deletedOr(node: NodeOf<'LogicalExpression'>): Node | undefined {
  const test = node.operator === '||' ? testOf(node.left) : undefined;
  return test?.present === false && test.temp.assignment !== undefined
    ? deletedChain(node.right, test.temp)
    : undefined;
}

/**
 * The source form of a compiled `V?.y` or `V ?? y`, or `undefined` when `node` is not one:
 * `(t = V) == null ? void 0 : t.y` gives `(t = V)?.y`, `(t = V) != null ? t : y` gives
 * `(t = V) ?? y`, the `(t = V) != null && t.y` of a minified test gives `(t = V)?.y`, the
 * `(t = V) == null || t.y` of a minified statement gives `(t = V)?.y` where its value is dropped,
 * `(t = V) != null || y()` gives `(t = V) ?? y()` and `a || (t = V) == null || t.y` gives
 * `a || (t = V)?.y` where their value is dropped, `(t = V) == null ? true : delete t.y` and
 * `(t = V) == null || delete t.y` give `delete (t = V)?.y`, and `(V?.y).call(t)` gives
 * `(V?.y)()`. The assignment stays, so `t` is still set, and passes its value on.
 */
function restored(node: Node, ancestors: readonly Node[]): Node | undefined {
  if (node.type === 'CallExpression') {
    return calledChain(node);
  }
  if (node.type === 'LogicalExpression') {
    return (
      testedChain(node, ancestors) ??
      nullishStatement(node, ancestors) ??
      flatChain(node, ancestors) ??
      deletedOr(node)
    );
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
  if (isTrue(fallback)) {
    return deletedChain(value, test.temp);
  }
  return nullishOf(fallback) === 'undefined' && rebase(value, test.temp)
    ? chainOf(value, node)
    : undefined;
}

/**
 * Restores each `V?.y`, `V ?? y` and `delete V?.y` that TypeScript, Babel or esbuild compiled for a target older
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
