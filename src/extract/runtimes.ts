import type { Node } from 'oxc-parser';

import type { Runtime } from '@/types.ts';

import { isEquality, isInequality, staticKey, strip, stringLiteral } from './ast.ts';
import { resolveBinding } from './bindings.ts';
import type { BindingContext } from './bindings.ts';
import { globalAliases } from './refs.ts';
import { isTracked, lookup } from './scope.ts';

// Which runtime a global, or a key of `process.versions`, belongs to.
const globalRuntimes = new Map<string, Runtime>([
  ['Deno', 'deno'],
  ['Bun', 'bun'],
]);
const versionRuntimes = new Map<string, Runtime>([
  ['deno', 'deno'],
  ['bun', 'bun'],
]);
// What each runtime's `navigator.userAgent` starts with.
const agentRuntimes = new Map<string, Runtime>([
  ['Cloudflare-Workers', 'workerd'],
  ['Bun', 'bun'],
  ['Deno', 'deno'],
]);

/** A name nothing in the file declares, so it is the global of that name. */
export function isUnbound(node: Node, name: string, context: BindingContext): boolean {
  return (
    node.type === 'Identifier' && node.name === name && lookup(context.scope, name) === undefined
  );
}

function isGlobalObject(node: Node, context: BindingContext): boolean {
  return [...globalAliases].some(name => isUnbound(node, name, context));
}

/** The global `name`, or the same property of the global object, as in `globalThis.Deno`. */
function isGlobal(node: Node, name: string, context: BindingContext): boolean {
  const inner = strip(node);
  return (
    isUnbound(inner, name, context) ||
    (inner.type === 'MemberExpression' &&
      staticKey(inner.property, inner.computed) === name &&
      isGlobalObject(strip(inner.object), context))
  );
}

function isProcess(node: Node, context: BindingContext): boolean {
  const binding = resolveBinding(node, context);
  return (
    isGlobal(node, 'process', context) ||
    (isTracked(binding) && binding.ref.module === 'process' && binding.ref.path.length === 0)
  );
}

/** The runtime a property names: `Deno` on the global object, or `bun` on `process.versions`. */
export function memberRuntime(
  object: Node,
  key: string,
  context: BindingContext,
): Runtime | undefined {
  const target = strip(object);
  if (isGlobalObject(target, context)) {
    return globalRuntimes.get(key);
  }
  const isVersions =
    target.type === 'MemberExpression' &&
    staticKey(target.property, target.computed) === 'versions' &&
    isProcess(target.object, context);
  return isVersions ? versionRuntimes.get(key) : undefined;
}

/** The runtime that has this value: `Deno`, `globalThis.Bun` or `process.versions?.bun`. */
export function runtimeMarker(node: Node, context: BindingContext): Runtime | undefined {
  const inner = strip(node);
  if (inner.type === 'Identifier') {
    return lookup(context.scope, inner.name) === undefined
      ? globalRuntimes.get(inner.name)
      : undefined;
  }
  if (inner.type !== 'MemberExpression') {
    return undefined;
  }
  const key = staticKey(inner.property, inner.computed);
  return key === undefined ? undefined : memberRuntime(inner.object, key, context);
}

function isUserAgent(node: Node, context: BindingContext): boolean {
  const inner = strip(node);
  return (
    inner.type === 'MemberExpression' &&
    staticKey(inner.property, inner.computed) === 'userAgent' &&
    isGlobal(inner.object, 'navigator', context)
  );
}

/** The runtime a test on `navigator.userAgent` names: `=== 'Cloudflare-Workers'` or `.startsWith('Bun')`. */
export function agentRuntime(node: Node, context: BindingContext): Runtime | undefined {
  let literal: Node | undefined;
  if (
    node.type === 'BinaryExpression' &&
    (isEquality(node.operator) || isInequality(node.operator))
  ) {
    if (isUserAgent(node.left, context)) {
      literal = node.right;
    } else if (isUserAgent(node.right, context)) {
      literal = node.left;
    }
    // Bun and Deno put a version in the user agent, so only Workers' is ever an exact match.
    if (literal !== undefined && stringLiteral(literal) !== 'Cloudflare-Workers') {
      return undefined;
    }
  } else if (node.type === 'CallExpression') {
    const callee = strip(node.callee);
    const method =
      callee.type === 'MemberExpression' ? staticKey(callee.property, callee.computed) : undefined;
    if (
      callee.type === 'MemberExpression' &&
      (method === 'startsWith' || method === 'includes') &&
      isUserAgent(callee.object, context)
    ) {
      [literal] = node.arguments;
    }
  }
  const text = literal === undefined ? undefined : stringLiteral(literal);
  return text === undefined ? undefined : agentRuntimes.get(text.replace(/\/$/u, ''));
}
