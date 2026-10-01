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
]);

const transparentNodes = new Set([
  'ParenthesizedExpression',
  'ChainExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
]);

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

export function staticKey(node: Node, computed: boolean): string | undefined {
  if (!computed) {
    return node.type === 'Identifier' ? node.name : staticString(node);
  }
  if (node.type === 'Literal' && typeof node.value === 'number') {
    return String(node.value);
  }
  return staticString(node);
}

/** `Symbol.iterator`, `Symbol('x')` and `Symbol.for('x')`: a key that can never name an API. */
export function isSymbolKey(node: Node): boolean {
  const inner = unwrap(node) ?? node;
  if (inner.type === 'CallExpression') {
    return isSymbolKey(inner.callee);
  }
  if (inner.type === 'MemberExpression') {
    return isSymbolKey(inner.object);
  }
  return inner.type === 'Identifier' && inner.name === 'Symbol';
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
