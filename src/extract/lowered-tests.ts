import type { Node } from 'oxc-parser';

import { isEquality, isInequality } from './ast.ts';
import type { NodeOf } from './ast.ts';

/** The operand under parentheses only. `strip` would also pass a temp that an earlier form marked. */
export function parens(node: Node): Node {
  let inner = node;
  while (inner.type === 'ParenthesizedExpression') {
    inner = inner.expression;
  }
  return inner;
}

/** `assignment` is `undefined` for a plain name, which a compiler reads twice without a temp. */
export type Temp = {
  name: string;
  node: Node;
  assignment: NodeOf<'AssignmentExpression'> | undefined;
};

/**
 * `(t = V)`: the temp `t` that a compiler sets to the value it tests, or a plain name `x`, which
 * it tests without a temp. `node` keeps its parentheses.
 */
export function tempOf(node: Node): Temp | undefined {
  const assignment = parens(node);
  if (assignment.type === 'Identifier') {
    return { name: assignment.name, node, assignment: undefined };
  }
  return assignment.type === 'AssignmentExpression' &&
    assignment.operator === '=' &&
    assignment.left.type === 'Identifier'
    ? { name: assignment.left.name, node, assignment }
    : undefined;
}

/** `null` or `void 0`, the two nullish values a compiler writes. The name `undefined` can be shadowed, so it does not count. */
export function nullishOf(node: Node): 'null' | 'undefined' | undefined {
  const inner = parens(node);
  if (inner.type === 'Literal' && inner.value === null) {
    return 'null';
  }
  const isVoid =
    inner.type === 'UnaryExpression' &&
    inner.operator === 'void' &&
    parens(inner.argument).type === 'Literal';
  return isVoid ? 'undefined' : undefined;
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
export function testOf(node: Node): Test | undefined {
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

export function isTemp(node: Node, temp: Temp): boolean {
  const inner = parens(node);
  return inner.type === 'Identifier' && inner.name === temp.name;
}
