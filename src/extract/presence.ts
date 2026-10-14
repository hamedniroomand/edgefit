import type { Node } from 'oxc-parser';

import type { PassedKey } from '@/types.ts';

import { rootName, strip } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { isTracked, lookup } from './scope.ts';
import type { KnownValue, Scope } from './scope.ts';

/** Reads the value that an expression always has, when it is known. */
type ReadValue = (node: Node, scope: Scope) => KnownValue | undefined;

const isPlainLiteral = (node: Node): node is NodeOf<'Literal'> & { value: boolean | number } =>
  node.type === 'Literal' && (typeof node.value === 'boolean' || typeof node.value === 'number');

/** A number after `-` or `+`, or a boolean after `!` as minifiers write `!0` and `!1`. */
function unaryLiteral(node: NodeOf<'UnaryExpression'>): PassedKey['value'] {
  const { argument, operator } = node;
  if (argument.type !== 'Literal' || typeof argument.value !== 'number') {
    return undefined;
  }
  const folds: Record<string, (value: number) => boolean | number> = {
    '!': value => value === 0,
    '-': value => -value,
    '+': value => value,
  };
  return folds[operator]?.(argument.value);
}

/** A literal value: a boolean or a number in the source, a folded unary literal, or a known string. */
export function literalOf(node: Node, value: KnownValue | undefined): PassedKey['value'] {
  const inner = strip(node);
  if (isPlainLiteral(inner)) {
    return inner.value;
  }
  if (inner.type === 'UnaryExpression') {
    return unaryLiteral(inner);
  }
  return typeof value === 'string' ? value : undefined;
}

export type Presence = 'defined' | 'undefined' | 'unknown';

/** Expressions whose value is never `undefined`. */
const definedTypes = new Set([
  'Literal',
  'ArrayExpression',
  'ObjectExpression',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassExpression',
  'TemplateLiteral',
  'NewExpression',
]);

/** A read of a Node.js module or of its member, such as `tls.checkServerIdentity`. */
function isModuleValue(node: Node, scope: Scope): boolean {
  const name = rootName(node);
  const binding = name === undefined ? undefined : lookup(scope, name);
  return isTracked(binding) && binding.ref.module !== '*globals*';
}

function readPresence(node: Node, scope: Scope, read: ReadValue): Presence {
  if (
    node.type === 'Identifier' &&
    node.name === 'undefined' &&
    lookup(scope, node.name) === undefined
  ) {
    return 'undefined';
  }
  return read(node, scope) !== undefined || isModuleValue(node, scope) ? 'defined' : 'unknown';
}

/**
 * Whether a value is always defined, always `undefined`, or not known. A key counts as passed only
 * with a defined value, because a value that may be `undefined` is the same as a key not passed.
 */
export function presenceOf(node: Node, scope: Scope, read: ReadValue): Presence {
  const inner = strip(node);
  if (inner.type === 'UnaryExpression') {
    return inner.operator === 'void' ? 'undefined' : 'defined';
  }
  if (definedTypes.has(inner.type)) {
    return 'defined';
  }
  if (inner.type === 'ConditionalExpression') {
    const results = [
      presenceOf(inner.consequent, scope, read),
      presenceOf(inner.alternate, scope, read),
    ];
    return results[0] === results[1] ? (results[0] ?? 'unknown') : 'unknown';
  }
  if (inner.type === 'LogicalExpression') {
    // `a || b` and `a ?? b` give `b` when `a` is missing, and `a` itself is then defined.
    const fallback = inner.operator === '&&' ? 'unknown' : presenceOf(inner.right, scope, read);
    return fallback === 'defined' ? 'defined' : 'unknown';
  }
  return inner.type === 'Identifier' || inner.type === 'MemberExpression'
    ? readPresence(inner, scope, read)
    : 'unknown';
}
