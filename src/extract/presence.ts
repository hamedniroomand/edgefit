import type { Node } from 'oxc-parser';

import type { PassedKey } from '@/types.ts';

import { isSymbolKey, staticKey, strip } from './ast.ts';
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
  const folds = new Map<string, (value: number) => boolean | number>([
    ['!', (value: number): boolean => value === 0],
    ['-', (value: number): number => -value],
    ['+', (value: number): number => value],
  ]);
  return folds.get(operator)?.(argument.value);
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

/**
 * A Node.js module, or one direct member of it, such as `tls.checkServerIdentity`. A deeper read,
 * such as `process.env.KEY`, may be `undefined`.
 */
function isModuleValue(node: Node, scope: Scope): boolean {
  let depth = 0;
  let inner = strip(node);
  while (inner.type === 'MemberExpression') {
    depth += 1;
    inner = strip(inner.object);
  }
  const binding = inner.type === 'Identifier' ? lookup(scope, inner.name) : undefined;
  if (!isTracked(binding) || binding.ref.module === '*globals*') {
    return false;
  }
  const { path } = binding.ref;
  return (path[0] === 'default' ? path.length - 1 : path.length) + depth <= 1;
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

/** Whether a value is known to be truthy or falsy: a literal, `!0` or `!1`, or a known value. */
function knownTruth(node: Node, scope: Scope, read: ReadValue): boolean | undefined {
  const inner = strip(node);
  // A regular expression that the runtime cannot build also has the value `null`.
  if (
    (inner.type === 'Literal' && inner.raw === 'null') ||
    presenceOf(inner, scope, read) === 'undefined'
  ) {
    return false;
  }
  const value = read(inner, scope);
  const literal = literalOf(inner, value);
  if (literal !== undefined) {
    return Boolean(literal);
  }
  // A known value is a string or an object, never `null`.
  return typeof value === 'object' ? true : undefined;
}

/**
 * The object literals that a spread can give. `always` says that one of them is always spread:
 * `...{ a }`, or `...(c ? { a } : { b })`. `...(x && { a })` may spread nothing. `'none'` is a
 * spread that gives no keys, as `...null` or `...(false && { a })`.
 */
export function spreadLiterals(
  property: Node,
  scope: Scope,
  read: ReadValue,
): { literals: NodeOf<'ObjectExpression'>[]; always: boolean } | 'none' | undefined {
  if (property.type !== 'SpreadElement') {
    return undefined;
  }
  const argument = strip(property.argument);
  if (argument.type === 'ObjectExpression') {
    return { literals: [argument], always: true };
  }
  if (knownTruth(argument, scope, read) === false) {
    return 'none';
  }
  if (argument.type === 'ConditionalExpression') {
    return conditionalLiterals(argument, scope, read);
  }
  if (argument.type !== 'LogicalExpression' || argument.operator !== '&&') {
    return undefined;
  }
  const truth = knownTruth(argument.left, scope, read);
  const right = strip(argument.right);
  if (truth === false) {
    return 'none';
  }
  return right.type === 'ObjectExpression'
    ? { literals: [right], always: truth === true }
    : undefined;
}

/** `c ? { a } : { b }`: the branch that a known test picks, or both branches. */
function conditionalLiterals(
  node: NodeOf<'ConditionalExpression'>,
  scope: Scope,
  read: ReadValue,
): { literals: NodeOf<'ObjectExpression'>[]; always: boolean } | undefined {
  const branches = [strip(node.consequent), strip(node.alternate)];
  const literals = branches.filter(branch => branch.type === 'ObjectExpression');
  if (literals.length !== 2) {
    return undefined;
  }
  const truth = knownTruth(node.test, scope, read);
  if (truth === undefined) {
    return { literals, always: true };
  }
  const picked = truth ? literals[0] : literals[1];
  return picked === undefined ? undefined : { literals: [picked], always: true };
}

/** The key of a property: a string, `null` for a Symbol key, which no option uses, or `undefined` when it is not known. */
export function propertyKey(property: Node): string | null | undefined {
  if (property.type !== 'Property') {
    return undefined;
  }
  if (property.computed && isSymbolKey(property.key)) {
    return null;
  }
  const { key } = property;
  return !property.computed && key.type === 'Literal' && typeof key.value === 'number'
    ? String(key.value)
    : staticKey(key, property.computed);
}

/** The keys that an object literal writes, or `undefined` when one of them is not known. */
export function writtenKeys(literal: NodeOf<'ObjectExpression'>): string[] | undefined {
  const keys = literal.properties.map(property => propertyKey(property));
  return keys.every(key => key !== undefined) ? keys.filter(key => key !== null) : undefined;
}
