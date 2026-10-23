import type { Node } from 'oxc-parser';

import { globalGuard, isNullish } from './api-guards.ts';
import { chainTemps, strip, unwrap } from './ast.ts';
import type { BindingContext } from './bindings.ts';
import { isCheckedOperand } from './checked-operands.ts';
import type { GlobalGuard } from './guard-stack.ts';
import { parens } from './lowered-tests.ts';
import { isFeatureCheck } from './refs.ts';
import { isDiscarded } from './statement-use.ts';

/** A value and what receives it. The value is the whole optional chain that holds a use, or an `&&` that holds the chain. */
type Consumer = { value: Node; parent: Node; outer: readonly Node[] };

/** A temp that a compiler writes, as in `(_a = x?.y)?.z`, holds the chain before it, so the chain goes on through it. */
function throughTemp(object: Node): Node {
  const temp = parens(object);
  if (temp.type !== 'AssignmentExpression' || !chainTemps.has(temp)) {
    return object;
  }
  const value = parens(temp.right);
  return value.type === 'ChainExpression' ? value.expression : value;
}

/**
 * The object of the first `?.` link of the chain that ends at `node`. A wrapper such as `(x)` ends
 * the chain, so a link behind it does not count.
 */
function firstOptionalObject(node: Node): Node | undefined {
  let found: Node | undefined;
  for (let link = node; link.type === 'MemberExpression'; link = throughTemp(link.object)) {
    if (link.optional) {
      found = link.object;
    }
  }
  return found;
}

/**
 * The end of the chain: `node` without the wrappers above it, such as `(x)`, `x!` and the `ChainExpression`
 * itself. An `await` is not read through, so an awaited read of a member is not covered. An awaited
 * call is, because its chain ends below the `await`.
 */
function chainEnd(node: Node): Node | undefined {
  let end = node;
  for (let inner = unwrap(end); inner !== undefined; inner = unwrap(end)) {
    if (end.type === 'AwaitExpression') {
      return undefined;
    }
    end = inner;
  }
  return end;
}

/** Whether `ancestor` is the next link of the chain: `.y` or `()` on `value`. */
const isLink = (ancestor: Node, value: Node): boolean =>
  (ancestor.type === 'MemberExpression' && ancestor.object === value) ||
  (ancestor.type === 'CallExpression' && ancestor.callee === value);

/**
 * What receives the value of the chain that ends at `node`. The links of the chain come first. Then
 * come the wrappers that pass the value on: the `ChainExpression`, the parentheses and the temp
 * that a compiler writes. A link behind a wrapper is not part of the chain, as in `(a?.b).c`.
 * `outer` holds the ancestors above `parent`.
 */
function chainConsumer(
  node: Node,
  parent: Node | undefined,
  outer: readonly Node[],
): Consumer | undefined {
  const above = parent === undefined ? [] : [parent, ...outer];
  let value = node;
  let inChain = unwrap(node) === undefined;
  let index = 0;
  for (let next = above[0]; next !== undefined; next = above[index]) {
    const isWrapper = next.type !== 'AwaitExpression' && unwrap(next) === value;
    if (!(inChain && isLink(next, value)) && !isWrapper) {
      break;
    }
    inChain = inChain && !isWrapper;
    value = next;
    index += 1;
  }
  const consumer = above[index];
  return consumer === undefined
    ? undefined
    : { value, parent: consumer, outer: above.slice(index + 1) };
}

/** Whether the other operand of the `||` or `??` is `null` or `undefined`, so the value of the operator can be nullish. */
const hasNullishOperand = (parent: Node): boolean =>
  parent.type === 'LogicalExpression' && (isNullish(parent.left) || isNullish(parent.right));

/** The place that receives `value`, above the wrappers that pass it on, as in `(n && x)` or `x!`. */
function throughWrappers(value: Node, outer: readonly Node[]): Consumer | undefined {
  let current = value;
  let index = 0;
  for (let next = outer[0]; next !== undefined; next = outer[index]) {
    if (next.type === 'AwaitExpression' || unwrap(next) !== current) {
      return { value: current, parent: next, outer: outer.slice(index + 1) };
    }
    current = next;
    index += 1;
  }
  return undefined;
}

/**
 * Whether the value of the chain goes where `undefined` does no harm: a check, an operand of `||` or `??`, or a place where nothing reads the value.
 * The value of `n && X` is `X` or a falsy `n`, so `X` goes where the `&&` goes. A place that tests the
 * `&&`, or that takes it as an operand of `||` or `??`, handles an absent `X` too.
 */
function handlesAbsence(consumer: Consumer, context: BindingContext): boolean {
  const { value, parent, outer } = consumer;
  if (
    isDiscarded(value, [...outer.toReversed(), parent]) ||
    isFeatureCheck(value, parent) ||
    (isCheckedOperand(value, parent, outer, context) && !hasNullishOperand(parent))
  ) {
    return true;
  }
  if (parent.type !== 'LogicalExpression' || parent.operator !== '&&' || parent.right !== value) {
    return false;
  }
  const next = throughWrappers(parent, outer);
  return next !== undefined && handlesAbsence(next, context);
}

/**
 * A `?.` link right after a property of the global object stops the rest of its chain when the
 * global is missing, as in `globalThis.Deno?.env.toObject()`. So the use runs only where the global
 * exists, unless other code fills the global. A bare name is not covered, because `Deno?.x` throws a
 * ReferenceError when `Deno` is not declared. A module is not covered either, because its value is
 * not always `undefined` when it is missing. A value that goes on, such as `const env = globalThis.Deno?.env.toObject()`, can reach
 * a use that throws, so it is not covered.
 * `node` is the end of the chain that the use follows, `parent` is its parent, and `outer` holds
 * the ancestors above `parent`, nearest first.
 */
export function optionalGlobalGuards(
  node: Node,
  parent: Node | undefined,
  outer: readonly Node[],
  context: BindingContext,
): GlobalGuard[] {
  const end = chainEnd(node);
  const object = end === undefined ? undefined : firstOptionalObject(end);
  // A compiler writes the object as `(_a = globalThis.Deno)`, which `strip` reads as the member.
  if (object === undefined || strip(object).type !== 'MemberExpression') {
    return [];
  }
  const consumer = chainConsumer(node, parent, outer);
  return consumer !== undefined && handlesAbsence(consumer, context)
    ? globalGuard(object, true, context)
    : [];
}
