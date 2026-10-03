import type { Node } from 'oxc-parser';

import { builtinName } from '@/data/builtins.ts';
import type { ApiRef } from '@/types.ts';

import { staticKey, staticString, strip, unwrap } from './ast.ts';
import type { NodeOf } from './ast.ts';
import type { ImportWrappers } from './import-wrappers.ts';
import {
  globalAliases,
  globalRef,
  isGlobalRoot,
  isInteropHelper,
  memberRef,
  moduleRef,
} from './refs.ts';
import { isTracked, lookup, lookupString } from './scope.ts';
import type { Binding, Scope } from './scope.ts';

export interface BindingContext {
  scope: Scope;
  globals: ReadonlySet<string>;
  /** What a bundler replaces `process.env.NODE_ENV` with, or `undefined` when it is not fixed. */
  nodeEnv: string | undefined;
  /** The functions that only run `import()` for their argument, from `findImportWrappers`. */
  wrappers: ImportWrappers;
}

function tracked(ref: ApiRef): Binding {
  return { ref, recorded: false };
}

/** What the names that a file exports stand for in the importer, by the specifier that loads it, from the seeds of `followAliases`. */
export function fileMembers(
  imported: ReadonlyMap<string, ApiRef>,
  specifier: string,
): Map<string, ApiRef> | undefined {
  const prefix = `${specifier}\0`;
  const members = new Map<string, ApiRef>();
  for (const [key, ref] of imported) {
    if (key.startsWith(prefix)) {
      members.set(key.slice(prefix.length), ref);
    }
  }
  return members.size > 0 ? members : undefined;
}

/**
 * The string that an expression spells out, directly, through a `const`, or by joining such strings
 * with a template literal or `+`: `` `card${suffix}` `` with `const suffix = 'inal'`.
 */
export function foldedString(node: Node | null | undefined, scope: Scope): string | undefined {
  const inner = node === null || node === undefined ? undefined : strip(node);
  if (inner?.type === 'Identifier') {
    return lookupString(scope, inner.name);
  }
  if (inner?.type === 'TemplateLiteral') {
    const parts = inner.quasis.flatMap((quasi, index) => [
      quasi.value.cooked ?? undefined,
      index < inner.expressions.length ? foldedString(inner.expressions[index], scope) : '',
    ]);
    return parts.every(part => part !== undefined) ? parts.join('') : undefined;
  }
  if (inner?.type === 'BinaryExpression' && inner.operator === '+') {
    const left = foldedString(inner.left, scope);
    const right = foldedString(inner.right, scope);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  return staticString(inner);
}

/** The module name an `import()` or `require()` argument spells out, directly or through a `const`. */
export function moduleSpecifier(node: Node | null | undefined, scope: Scope): string | undefined {
  return foldedString(node, scope);
}

export function isRequire(callee: Node, scope: Scope): boolean {
  if (callee.type !== 'Identifier') {
    return false;
  }
  // esbuild's ESM output declares its own `__require`, so the name alone identifies it.
  if (callee.name === '__require') {
    return true;
  }
  const binding = lookup(scope, callee.name);
  return binding === 'require' || (binding === undefined && callee.name === 'require');
}

/** The built-in a `require('...')` call loads, if this is one. */
export function requiredModule(node: NodeOf<'CallExpression'>, scope: Scope): string | undefined {
  if (!isRequire(node.callee, scope)) {
    return undefined;
  }
  const specifier = moduleSpecifier(node.arguments[0], scope);
  return specifier === undefined ? undefined : builtinName(specifier);
}

/** The argument of an interop helper call like `__importDefault(require('fs'))`. */
export function interopArgument(node: NodeOf<'CallExpression'>): Node | undefined {
  const [argument] = node.arguments;
  if (
    argument === undefined ||
    argument.type === 'SpreadElement' ||
    !isInteropHelper(node.callee)
  ) {
    return undefined;
  }
  return argument;
}

/**
 * Turbopack loads a Node.js built-in in its output as `e.x("node:timers", () => require("node:timers"), !0)`.
 * The call returns the module, so what it is assigned to is the module. Only this shape counts: a
 * `node:` name, and an arrow function that returns a `require` of the same name.
 */
function wrappedModule(node: NodeOf<'CallExpression'>, scope: Scope): string | undefined {
  const [name, factory] = node.arguments;
  const specifier = name === undefined ? undefined : staticString(name);
  if (specifier?.startsWith('node:') !== true || factory?.type !== 'ArrowFunctionExpression') {
    return undefined;
  }
  const body = factory.expression ? (unwrap(factory.body) ?? factory.body) : undefined;
  const [argument] = body?.type === 'CallExpression' ? body.arguments : [];
  const same = argument !== undefined && staticString(argument) === specifier;
  return body?.type === 'CallExpression' && isRequire(body.callee, scope) && same
    ? builtinName(specifier)
    : undefined;
}

/**
 * Turbopack's output for `await import('node:timers')` is
 * `await Promise.resolve().then(() => e.x("node:timers", () => require("node:timers"), !0))`.
 */
function lazyWrappedModule(node: NodeOf<'CallExpression'>, scope: Scope): string | undefined {
  const callee = node.callee;
  const [handler] = node.arguments;
  if (
    callee.type !== 'MemberExpression' ||
    staticKey(callee.property, callee.computed) !== 'then' ||
    handler?.type !== 'ArrowFunctionExpression' ||
    !handler.expression
  ) {
    return undefined;
  }
  const receiver = unwrap(callee.object) ?? callee.object;
  const start =
    receiver.type === 'CallExpression' ? (unwrap(receiver.callee) ?? receiver.callee) : undefined;
  const isPromiseResolve =
    start?.type === 'MemberExpression' &&
    start.object.type === 'Identifier' &&
    start.object.name === 'Promise' &&
    staticKey(start.property, start.computed) === 'resolve';
  const body = unwrap(handler.body) ?? handler.body;
  return isPromiseResolve && body.type === 'CallExpression'
    ? wrappedModule(body, scope)
    : undefined;
}

function resolveCall(node: NodeOf<'CallExpression'>, context: BindingContext): Binding | undefined {
  // A call of a function that only imports its argument stands for the import of its literal.
  const imported = context.wrappers.calls.get(node);
  const importedModule = imported === undefined ? undefined : builtinName(imported);
  if (importedModule !== undefined) {
    return tracked(moduleRef(importedModule));
  }
  const wrapped = wrappedModule(node, context.scope) ?? lazyWrappedModule(node, context.scope);
  if (wrapped !== undefined) {
    return tracked(moduleRef(wrapped));
  }
  const module = requiredModule(node, context.scope);
  if (module !== undefined) {
    return tracked(moduleRef(module));
  }
  const callee = resolveBinding(node.callee, context);
  if (
    isTracked(callee) &&
    callee.ref.module === 'module' &&
    callee.ref.path.at(-1) === 'createRequire'
  ) {
    return 'require';
  }
  const argument = interopArgument(node);
  return argument === undefined ? undefined : resolveBinding(argument, context);
}

/** Whether `node` is the global object under any of its names, even a name the target lacks. */
function isGlobalObject(node: Node, context: BindingContext): boolean {
  if (node.type === 'Identifier' && lookup(context.scope, node.name) === undefined) {
    return node.name === 'window' || globalAliases.has(node.name);
  }
  const binding = resolveBinding(node, context);
  return isTracked(binding) && isGlobalRoot(binding.ref);
}

/** What an expression evaluates to, as far as edgefit tracks it. Records nothing. */
export function resolveBinding(node: Node, context: BindingContext): Binding | undefined {
  if (node.type === 'Identifier') {
    const binding = lookup(context.scope, node.name);
    if (binding === undefined && context.globals.has(node.name)) {
      return tracked(globalRef(node.name));
    }
    return binding;
  }
  if (node.type === 'MemberExpression') {
    const object = resolveBinding(node.object, context);
    const key = staticKey(node.property, node.computed);
    if (isTracked(object) && object.members !== undefined) {
      const member = key === undefined ? undefined : object.members.get(key);
      return member === undefined ? undefined : tracked(member);
    }
    return isTracked(object) && key !== undefined ? tracked(memberRef(object.ref, key)) : undefined;
  }
  if (node.type === 'CallExpression') {
    return resolveCall(node, context);
  }
  // `typeof window !== 'undefined' ? window : globalThis` is the global object either way.
  if (
    node.type === 'ConditionalExpression' &&
    isGlobalObject(node.consequent, context) &&
    isGlobalObject(node.alternate, context)
  ) {
    return tracked(globalRef('globalThis'));
  }
  if (node.type === 'ImportExpression') {
    const specifier = moduleSpecifier(node.source, context.scope);
    const module = specifier === undefined ? undefined : builtinName(specifier);
    return module === undefined ? undefined : tracked(moduleRef(module));
  }
  const inner = unwrap(node);
  return inner === undefined ? undefined : resolveBinding(inner, context);
}
