import type { Node } from 'oxc-parser';

import { builtinName } from '@/data/builtins.ts';
import type { ApiRef } from '@/types.ts';

import { staticKey, staticString, unwrap } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { globalRef, isInteropHelper, memberRef, moduleRef } from './refs.ts';
import { isTracked, lookup, lookupString } from './scope.ts';
import type { Binding, Scope } from './scope.ts';

export interface BindingContext {
  scope: Scope;
  globals: ReadonlySet<string>;
}

function tracked(ref: ApiRef): Binding {
  return { ref, recorded: false };
}

/** The module name an `import()` or `require()` argument spells out, directly or through a `const`. */
export function moduleSpecifier(node: Node | null | undefined, scope: Scope): string | undefined {
  if (node?.type === 'Identifier') {
    return lookupString(scope, node.name);
  }
  return staticString(node);
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

function resolveCall(node: NodeOf<'CallExpression'>, context: BindingContext): Binding | undefined {
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
    return isTracked(object) && key !== undefined ? tracked(memberRef(object.ref, key)) : undefined;
  }
  if (node.type === 'CallExpression') {
    return resolveCall(node, context);
  }
  if (node.type === 'ImportExpression') {
    const specifier = moduleSpecifier(node.source, context.scope);
    const module = specifier === undefined ? undefined : builtinName(specifier);
    return module === undefined ? undefined : tracked(moduleRef(module));
  }
  const inner = unwrap(node);
  return inner === undefined ? undefined : resolveBinding(inner, context);
}
