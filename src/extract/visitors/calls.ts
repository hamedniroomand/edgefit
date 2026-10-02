import { builtinName } from '@/data/builtins.ts';
import { memberPath } from '@/data/compat-index.ts';
import { stringLiteral } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { interopArgument, isRequire, moduleSpecifier, resolveBinding } from '@/extract/bindings.ts';
import type { VisitContext, Visitor } from '@/extract/context.ts';
import { moduleRef } from '@/extract/refs.ts';
import { isGlobal } from '@/extract/runtimes.ts';
import { isTracked } from '@/extract/scope.ts';

import { visitOptionalCallee } from './guards.ts';
import { visitParentClass } from './inheritance.ts';

// The call of the `Function` constructor with code in a string, which Vercel's Edge runtime
// disables. Shown as `Function(string)`.
const dynamicFunction = { module: '*globals*', path: ['Function', '(string)'] };

/** `Function('return this')()` is the classic way to reach the global object, and code that uses it checks for `globalThis` first. */
const isGlobalObjectIdiom = /^\s*return\s+this\s*;?\s*$/u;

/** `Function(code)` and `new Function(code)`: code built from a string. Without arguments it builds nothing to run. */
function recordDynamicFunction(
  node: NodeOf<'CallExpression'> | NodeOf<'NewExpression'>,
  context: VisitContext,
): void {
  if (node.arguments.length === 0 || !isGlobal(node.callee, 'Function', context)) {
    return;
  }
  const [only] = node.arguments;
  const text = node.arguments.length === 1 && only !== undefined ? stringLiteral(only) : undefined;
  if (text === undefined || !isGlobalObjectIdiom.test(text)) {
    context.useRef(dynamicFunction, node.start);
  }
}

const computedModuleReason = 'the module name is computed at runtime';

function visitRequire(node: NodeOf<'CallExpression'>, context: VisitContext): void {
  const [argument] = node.arguments;
  if (argument === undefined) {
    return;
  }
  const specifier = moduleSpecifier(argument, context.scope);
  if (specifier === undefined) {
    context.collector.dynamic(undefined, 'require(<expression>)', computedModuleReason, node.start);
    context.visit(argument);
    return;
  }
  context.collector.native(specifier, argument.start);
  const module = builtinName(specifier);
  if (module !== undefined) {
    context.useRef(moduleRef(module), argument.start);
  }
}

/** `util.inherits(Child, Parent)` makes `Parent` the parent class of `Child`. */
function visitInherits(node: NodeOf<'CallExpression'>, context: VisitContext): boolean {
  const callee = resolveBinding(node.callee, context);
  const [child, parent, ...rest] = node.arguments;
  if (
    !isTracked(callee) ||
    callee.ref.module !== 'util' ||
    memberPath(callee.ref).join('.') !== 'inherits' ||
    child === undefined ||
    parent === undefined ||
    parent.type === 'SpreadElement'
  ) {
    return false;
  }
  context.visit(node.callee);
  context.visitAll([child]);
  visitParentClass(parent, context);
  context.visitAll(rest);
  return true;
}

export const visitCall: Visitor<NodeOf<'CallExpression'>> = (node, context) => {
  recordDynamicFunction(node, context);
  if (isRequire(node.callee, context.scope)) {
    visitRequire(node, context);
    return;
  }
  const argument = interopArgument(node);
  const binding = argument === undefined ? undefined : resolveBinding(argument, context);
  if (argument !== undefined && isTracked(binding)) {
    context.visitBound(argument);
    // The helper call stands for the module itself; its argument was recorded above.
    context.useRef(binding.ref, node.start, false);
    return;
  }
  if (!visitInherits(node, context) && !visitOptionalCallee(node, context)) {
    context.visitChildren(node);
  }
};

export const visitImportExpression: Visitor<NodeOf<'ImportExpression'>> = (node, context) => {
  const specifier = moduleSpecifier(node.source, context.scope);
  if (specifier === undefined) {
    context.collector.dynamic(undefined, 'import(<expression>)', computedModuleReason, node.start);
    context.visitChildren(node);
    return;
  }
  const module = builtinName(specifier);
  // Only an awaited import can be caught by a `try`; a promise nothing awaits fails on its own.
  const record = (): void => {
    context.collector.native(specifier, node.source.start);
    if (module !== undefined) {
      context.useRef(moduleRef(module), node.source.start);
    }
  };
  if (context.parent()?.type === 'AwaitExpression') {
    record();
  } else {
    context.collector.guards.deferred(record);
  }
};

export const visitNew: Visitor<NodeOf<'NewExpression'>> = (node, context) => {
  recordDynamicFunction(node, context);
  context.visitChildren(node);
};
