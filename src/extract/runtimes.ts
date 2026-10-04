import type { Node } from 'oxc-parser';

import type { Runtime } from '@/types.ts';

import { isEquality, isInequality, staticKey, strip, stringLiteral } from './ast.ts';
import { resolveBinding } from './bindings.ts';
import type { BindingContext } from './bindings.ts';
import { globalAliases } from './refs.ts';
import { isFactoryModule, isTracked, lookup } from './scope.ts';

// Which runtime a global, or a key of `process.versions`, belongs to.
const globalRuntimes = new Map<string, Runtime>([
  ['Deno', 'deno'],
  ['Bun', 'bun'],
  ['EdgeRuntime', 'vercel-edge'],
  ['Netlify', 'netlify'],
]);
// What `typeof` says about each global marker when its runtime is there. `typeof EdgeRuntime` is
// `'string'`, which is the form Vercel documents, so `!== 'string'` means another runtime. A key of
// `process.versions` (`process.versions.bun`) is a string too.
const markerTypes = new Map<string, string>([
  ['Deno', 'object'],
  ['Bun', 'object'],
  ['EdgeRuntime', 'string'],
  ['Netlify', 'object'],
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
export function isGlobal(node: Node, name: string, context: BindingContext): boolean {
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

/** The `typeof` a runtime marker has when its runtime is there, or `undefined` for anything else. */
export function markerType(node: Node, context: BindingContext): string | undefined {
  if (runtimeMarker(node, context) === undefined) {
    return undefined;
  }
  const inner = strip(node);
  const name =
    inner.type === 'Identifier'
      ? inner.name
      : inner.type === 'MemberExpression'
        ? staticKey(inner.property, inner.computed)
        : undefined;
  if (name === undefined) {
    return undefined;
  }
  return markerTypes.get(name) ?? (versionRuntimes.has(name) ? 'string' : undefined);
}

function isEnvVariable(node: Node, name: string, context: BindingContext): boolean {
  const inner = strip(node);
  if (inner.type !== 'MemberExpression' || staticKey(inner.property, inner.computed) !== name) {
    return false;
  }
  const env = strip(inner.object);
  return (
    env.type === 'MemberExpression' &&
    staticKey(env.property, env.computed) === 'env' &&
    isProcess(env.object, context)
  );
}

function isNextRuntime(node: Node, context: BindingContext): boolean {
  return isEnvVariable(node, 'NEXT_RUNTIME', context);
}

/**
 * Whether a comparison of `process.env.NODE_ENV` with a string is true, as a bundler sees it: it
 * replaces the variable with a constant. Returns `undefined` for any other comparison.
 */
export function nodeEnvMatches(node: Node, context: BindingContext): boolean | undefined {
  if (node.type !== 'BinaryExpression') {
    return undefined;
  }
  const [value, literal] = isEnvVariable(node.left, 'NODE_ENV', context)
    ? [node.left, node.right]
    : [node.right, node.left];
  const text = isEnvVariable(value, 'NODE_ENV', context) ? stringLiteral(literal) : undefined;
  return text === undefined || context.nodeEnv === undefined ? undefined : text === context.nodeEnv;
}

/** Imported files cannot be the CommonJS entry module. */
export function mainModuleMatches(node: Node, context: BindingContext): boolean | undefined {
  if (context.imported !== true || node.type !== 'BinaryExpression') {
    return undefined;
  }
  const isMain = (value: Node): boolean => {
    const inner = strip(value);
    return (
      inner.type === 'MemberExpression' &&
      staticKey(inner.property, inner.computed) === 'main' &&
      isUnbound(strip(inner.object), 'require', context)
    );
  };
  const isModule = (value: Node): boolean => {
    const inner = strip(value);
    return (
      isUnbound(inner, 'module', context) ||
      (inner.type === 'Identifier' && isFactoryModule(context.scope, inner.name))
    );
  };
  return (isMain(node.left) && isModule(node.right)) || (isMain(node.right) && isModule(node.left))
    ? false
    : undefined;
}

/**
 * What a comparison of `process.env.NEXT_RUNTIME` with a string says about Vercel's Edge runtime:
 * Next.js replaces it at build time with `'edge'` for the edge build and `'nodejs'` for the Node
 * one. Returns whether the comparison being equal means the Edge runtime is there.
 */
export function nextRuntimeEdge(node: Node, context: BindingContext): boolean | undefined {
  if (node.type !== 'BinaryExpression') {
    return undefined;
  }
  const [value, literal] = isNextRuntime(node.left, context)
    ? [node.left, node.right]
    : [node.right, node.left];
  const text = isNextRuntime(value, context) ? stringLiteral(literal) : undefined;
  if (text === 'edge') {
    return true;
  }
  return text === 'nodejs' ? false : undefined;
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
