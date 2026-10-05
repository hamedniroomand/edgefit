import { visitorKeys } from 'oxc-parser';
import type { Node } from 'oxc-parser';

// Distributes over `Node` because some nodes declare a union `type`, e.g. oxc's `Function`.
export type NodeOf<T extends Node['type']> = Node extends infer Candidate
  ? Candidate extends { type: infer Type }
    ? [Extract<Type, T>] extends [never]
      ? never
      : Candidate
    : never
  : never;

const typeOnlyKeys = new Set([
  'typeAnnotation',
  'returnType',
  'typeParameters',
  'typeArguments',
  'superTypeArguments',
  'implements',
]);

// Every other `TS*` node is type-only and never references runtime values.
const runtimeTsNodes = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
  'TSParameterProperty',
  'TSExportAssignment',
  'TSModuleDeclaration',
  'TSModuleBlock',
  'TSImportEqualsDeclaration',
  'TSEnumDeclaration',
  'TSEnumBody',
  'TSEnumMember',
]);

const transparentNodes = new Set([
  'ParenthesizedExpression',
  'ChainExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
]);

/** Members that call a function: `fn.call(...)` uses `fn` itself, so `call` is not part of the API. */
export const invokers = new Set(['apply', 'bind', 'call']);

export function isTypeOnly(node: Node): boolean {
  if (node.type.startsWith('TS') && !runtimeTsNodes.has(node.type)) {
    return true;
  }
  return 'declare' in node && node.declare === true;
}

export function childNodes(node: Node): Node[] {
  const keys = visitorKeys[node.type] ?? [];
  const record = node as unknown as Record<string, unknown>;
  const children: Node[] = [];
  for (const key of keys) {
    if (typeOnlyKeys.has(key)) {
      continue;
    }
    const value = record[key];
    const items: unknown[] = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (typeof item === 'object' && item !== null) {
        children.push(item as Node);
      }
    }
  }
  return children;
}

export function staticString(node: Node | null | undefined): string | undefined {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

/** The local names of `{ a, b: c = 1 }`, by the name they take, when every one is a plain name. */
export function destructuredNames(pattern: Node): Map<string, string> | undefined {
  if (pattern.type !== 'ObjectPattern') {
    return undefined;
  }
  const taken = new Map<string, string>();
  for (const property of pattern.properties) {
    if (property.type === 'RestElement') {
      return undefined;
    }
    const key = staticKey(property.key, property.computed);
    const value =
      property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
    if (key === undefined || value.type !== 'Identifier') {
      return undefined;
    }
    taken.set(value.name, key);
  }
  return taken;
}

export function staticKey(node: Node, computed: boolean): string | undefined {
  if (!computed) {
    return node.type === 'Identifier' ? node.name : staticString(node);
  }
  if (node.type === 'Literal' && typeof node.value === 'number') {
    return String(node.value);
  }
  return staticString(node);
}

function isSymbolGlobal(node: Node): boolean {
  return node.type === 'Identifier' && node.name === 'Symbol';
}

/** `Symbol.iterator`, `Symbol('x')` and `Symbol.for('x')`: a key that can never name an API. */
export function isSymbolKey(node: Node): boolean {
  const inner = unwrap(node) ?? node;
  if (inner.type === 'CallExpression') {
    const callee = unwrap(inner.callee) ?? inner.callee;
    return (
      isSymbolGlobal(callee) ||
      (callee.type === 'MemberExpression' &&
        isSymbolGlobal(callee.object) &&
        staticKey(callee.property, callee.computed) === 'for')
    );
  }
  return inner.type === 'MemberExpression' && isSymbolGlobal(inner.object);
}

/** The name at the start of `a.b.c`, or `a` itself. */
export function rootName(node: Node): string | undefined {
  const inner = strip(node);
  if (inner.type === 'MemberExpression') {
    return rootName(inner.object);
  }
  return inner.type === 'Identifier' ? inner.name : undefined;
}

/** The operand of a wrapper that passes its value through unchanged, such as `(x)`, `x!` or `await x`. */
export function unwrap(node: Node): Node | undefined {
  if (transparentNodes.has(node.type) && 'expression' in node) {
    return node.expression as Node;
  }
  return node.type === 'AwaitExpression' ? node.argument : undefined;
}

/** The operand under every wrapper that passes its value through, as `x` in `(await x!)`. */
export function strip(node: Node): Node {
  let current = node;
  for (let inner = unwrap(current); inner !== undefined; inner = unwrap(current)) {
    current = inner;
  }
  return current;
}

export function stringLiteral(node: Node): string | undefined {
  const inner = strip(node);
  return inner.type === 'Literal' && typeof inner.value === 'string' ? inner.value : undefined;
}

export function isEquality(operator: string): boolean {
  return operator === '==' || operator === '===';
}

export function isInequality(operator: string): boolean {
  return operator === '!=' || operator === '!==';
}

export type FunctionNode = NodeOf<
  'FunctionDeclaration' | 'FunctionExpression' | 'ArrowFunctionExpression'
>;

export function isFunction(node: Node): node is FunctionNode {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}
