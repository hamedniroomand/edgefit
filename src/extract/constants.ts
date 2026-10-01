import type { Node } from 'oxc-parser';

import { strip } from './ast.ts';

type Primitive = string | number | boolean | null | undefined;

/** A value known without running anything. `undefined` for a node that is not one. */
type Constant = { value: Primitive } | undefined;

const strictOperators = new Set(['===', '!==']);
const looseOperators = new Set(['==', '!=']);

const truthy: (value: Primitive) => boolean = Boolean;

function isNullish(value: Primitive): boolean {
  return value === null || value === undefined;
}

/** `==` between values of one type, or two nullish values. Anything else needs coercion rules. */
function looseEquals(left: Primitive, right: Primitive): boolean | undefined {
  if (isNullish(left) && isNullish(right)) {
    return true;
  }
  return typeof left === typeof right ? left === right : undefined;
}

function compare(operator: string, left: Primitive, right: Primitive): Constant {
  const equal = strictOperators.has(operator) ? left === right : looseEquals(left, right);
  if (equal === undefined) {
    return undefined;
  }
  return { value: operator.startsWith('!') ? !equal : equal };
}

function unary(operator: string, argument: Node): Constant {
  const inner = constantOf(argument);
  if (inner === undefined) {
    return undefined;
  }
  switch (operator) {
    case '!': {
      return { value: !truthy(inner.value) };
    }
    case 'void': {
      return { value: undefined };
    }
    case 'typeof': {
      return { value: inner.value === null ? 'object' : typeof inner.value };
    }
    case '-': {
      return typeof inner.value === 'number' ? { value: -inner.value } : undefined;
    }
    default: {
      return undefined;
    }
  }
}

function logical(operator: string, left: Node, right: Node): Constant {
  const first = constantOf(left);
  if (first === undefined) {
    return undefined;
  }
  const keepsLeft =
    operator === '&&'
      ? !truthy(first.value)
      : operator === '||'
        ? truthy(first.value)
        : !isNullish(first.value);
  return keepsLeft ? first : constantOf(right);
}

/**
 * The value of an expression made only of literals, such as `'edge' === 'nodejs'`, `!0` or
 * `typeof 'x' === 'string'`. A bundler replaces what it knows at build time with literals, and
 * its minifier folds them, so the branch they decide is removed from the output.
 */
export function constantOf(node: Node): Constant {
  const inner = strip(node);
  if (inner.type === 'Literal') {
    const { value } = inner;
    const primitive = value === null || ['string', 'number', 'boolean'].includes(typeof value);
    // A regular expression or a bigint is not a plain value.
    return primitive && !('regex' in inner) ? { value: value as Primitive } : undefined;
  }
  if (inner.type === 'UnaryExpression') {
    return unary(inner.operator, inner.argument);
  }
  if (inner.type === 'LogicalExpression') {
    return logical(inner.operator, inner.left, inner.right);
  }
  if (inner.type !== 'BinaryExpression') {
    return undefined;
  }
  const [left, right] = [constantOf(inner.left), constantOf(inner.right)];
  const known = left !== undefined && right !== undefined;
  return known && (strictOperators.has(inner.operator) || looseOperators.has(inner.operator))
    ? compare(inner.operator, left.value, right.value)
    : undefined;
}
