import { visitorKeys } from 'oxc-parser';
import type { Node } from 'oxc-parser';

import { chainTemps, isEquality, isInequality } from './ast.ts';
import type { NodeOf } from './ast.ts';

/** The operand under parentheses only. `strip` would also pass a temp that an earlier form marked. */
function parens(node: Node): Node {
  let inner = node;
  while (inner.type === 'ParenthesizedExpression') {
    inner = inner.expression;
  }
  return inner;
}

type Temp = { name: string; node: Node; assignment: NodeOf<'AssignmentExpression'> };

/** `(t = V)`: the temp `t` that a compiler sets to the value it tests. `node` keeps its parentheses. */
function tempOf(node: Node): Temp | undefined {
  const assignment = parens(node);
  return assignment.type === 'AssignmentExpression' &&
    assignment.operator === '=' &&
    assignment.left.type === 'Identifier'
    ? { name: assignment.left.name, node, assignment }
    : undefined;
}

function nullishOf(node: Node): 'null' | 'undefined' | undefined {
  const inner = parens(node);
  if (inner.type === 'Literal' && inner.value === null) {
    return 'null';
  }
  const isUndefined =
    (inner.type === 'Identifier' && inner.name === 'undefined') ||
    (inner.type === 'UnaryExpression' && inner.operator === 'void');
  return isUndefined ? 'undefined' : undefined;
}

type Compare = { operand: Node; nullish: 'null' | 'undefined'; strict: boolean; equal: boolean };

/** `x == null`, `null === x` and the like: the operand that is compared with a nullish value. */
function compareOf(node: Node): Compare | undefined {
  const inner = parens(node);
  if (
    inner.type !== 'BinaryExpression' ||
    (!isEquality(inner.operator) && !isInequality(inner.operator))
  ) {
    return undefined;
  }
  const right = nullishOf(inner.right);
  const [operand, nullish] =
    right === undefined ? [inner.right, nullishOf(inner.left)] : [inner.left, right];
  return nullish === undefined
    ? undefined
    : { operand, nullish, strict: inner.operator.length === 3, equal: isEquality(inner.operator) };
}

type Test = { temp: Temp; present: boolean };

/**
 * The test of a compiled form: `(t = V) == null` (esbuild), or the strict pair
 * `(t = V) === null || t === void 0` (TypeScript, Babel). `present` is true for `!=` and for the
 * pair with `!==` and `&&`. A strict compare alone is not the form: `(t = V) === null` lets an
 * `undefined` value through to `t.y`.
 */
function testOf(node: Node): Test | undefined {
  const inner = parens(node);
  const single = compareOf(inner);
  if (single !== undefined) {
    const temp = tempOf(single.operand);
    return temp === undefined || single.strict ? undefined : { temp, present: !single.equal };
  }
  if (inner.type !== 'LogicalExpression' || (inner.operator !== '||' && inner.operator !== '&&')) {
    return undefined;
  }
  const present = inner.operator === '&&';
  const first = compareOf(inner.left);
  const second = compareOf(inner.right);
  const temp = first === undefined ? undefined : tempOf(first.operand);
  const paired =
    first !== undefined &&
    second !== undefined &&
    first.strict &&
    second.strict &&
    first.equal !== present &&
    second.equal !== present &&
    first.nullish !== second.nullish;
  const name = second === undefined ? undefined : parens(second.operand);
  return temp !== undefined && paired && name?.type === 'Identifier' && name.name === temp.name
    ? { temp, present }
    : undefined;
}

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
  if (temp !== undefined && temp.name === name.name) {
    chainTemps.add(temp.assignment);
    return true;
  }
  return object.type === 'Identifier' && object.name === name.name;
}

function isTemp(node: Node, temp: Temp): boolean {
  const inner = parens(node);
  return inner.type === 'Identifier' && inner.name === temp.name;
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
    if (!isCallOf(inner.callee, temp) || !isObjectOf(thisArg, temp.assignment.right)) {
      return rebase(inner.callee, temp);
    }
    inner.callee = temp.node as typeof inner.callee;
    inner.arguments = rest;
  } else {
    return false;
  }
  inner.optional = true;
  chainTemps.add(temp.assignment);
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

/**
 * The source form of a compiled `V?.y` or `V ?? y`, or `undefined` when `node` is not one:
 * `(t = V) == null ? void 0 : t.y` gives `(t = V)?.y`, `(t = V) != null ? t : y` gives
 * `(t = V) ?? y`, the `(t = V) != null && t.y` of a minified test gives `(t = V)?.y`, and
 * `(V?.y).call(t)` gives `(V?.y)()`. The assignment stays, so `t` is still set, and passes its
 * value on.
 */
function restored(node: Node): Node | undefined {
  if (node.type === 'CallExpression') {
    return calledChain(node);
  }
  if (node.type === 'LogicalExpression') {
    const test = node.operator === '&&' ? testOf(node.left) : undefined;
    return test?.present === true && rebase(node.right, test.temp)
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
export function restoreChains(node: Node): Node {
  const record = node as unknown as Record<string, unknown>;
  for (const key of visitorKeys[node.type] ?? []) {
    const value = record[key];
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        if (isNode(item)) {
          value[index] = restoreChains(item);
        }
      }
    } else if (isNode(value)) {
      record[key] = restoreChains(value);
    }
  }
  return restored(node) ?? node;
}
