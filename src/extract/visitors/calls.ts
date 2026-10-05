import { builtinName } from '@/data/builtins.ts';
import { memberPath } from '@/data/compat-index.ts';
import { staticKey, stringLiteral, strip } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { interopArgument, isRequire, moduleSpecifier, resolveBinding } from '@/extract/bindings.ts';
import type { VisitContext, Visitor } from '@/extract/context.ts';
import { moduleRef } from '@/extract/refs.ts';
import { isGlobal } from '@/extract/runtimes.ts';
import { isTracked, isWasmImport } from '@/extract/scope.ts';

import { visitOptionalCallee } from './guards.ts';
import { visitParentClass } from './inheritance.ts';

// The call of the `Function` constructor with code in a string, which Vercel's Edge runtime
// disables. Shown as `Function(string)`.
const dynamicFunction = { module: '*globals*', path: ['Function', '(string)'] };

// A `require` whose module is chosen at runtime. No bundler can resolve it, and Vercel's Edge
// runtime does not allow a `require` call that is left for runtime. Shown as `require(<expression>)`.
const dynamicRequire = { module: '*globals*', path: ['require', '(dynamic)'] };

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

// The call of `WebAssembly.instantiate` with a source other than an imported module, which Vercel's
// Edge runtime disables. Shown as `WebAssembly.instantiate(bytes)`.
const wasmBytes = { module: '*globals*', path: ['WebAssembly', 'instantiate', '(bytes)'] };

/** Only an imported module can be instantiated; a parameter may hold one, which edgefit cannot see. */
function recordWasmBytes(node: NodeOf<'CallExpression'>, context: VisitContext): void {
  const callee = strip(node.callee);
  const [source] = node.arguments;
  if (
    source === undefined ||
    callee.type !== 'MemberExpression' ||
    staticKey(callee.property, callee.computed) !== 'instantiate' ||
    !isGlobal(callee.object, 'WebAssembly', context)
  ) {
    return;
  }
  const inner = strip(source);
  if (inner.type !== 'Identifier' || !isWasmImport(context.scope, inner.name)) {
    context.useRef(wasmBytes, node.start);
  }
}

const computedModuleReason = 'the module name is computed at runtime';

// The code of the error that a load of a missing module throws, when the name has no `node:` prefix.
const missingFileCodes = { import: 'ERR_MODULE_NOT_FOUND', require: 'MODULE_NOT_FOUND' } as const;

/**
 * Runs `record` as caught where a `catch` stops the error of a missing `specifier`. The code
 * after the load then runs only when the module is there.
 */
function recordMissing(
  specifier: string,
  kind: keyof typeof missingFileCodes,
  context: VisitContext,
  record: () => void,
): void {
  const code = specifier.startsWith('node:')
    ? 'ERR_UNKNOWN_BUILTIN_MODULE'
    : missingFileCodes[kind];
  const { guards } = context.collector;
  if (!guards.missingCode(code)) {
    record();
    return;
  }
  guards.caught(record);
  const module = builtinName(specifier);
  if (module !== undefined) {
    guards.loaded(moduleRef(module).module);
  }
}

function visitRequire(node: NodeOf<'CallExpression'>, context: VisitContext): void {
  const [argument] = node.arguments;
  if (argument === undefined) {
    return;
  }
  const specifier = moduleSpecifier(argument, context.scope);
  if (specifier === undefined) {
    // A `try` catches the error of a `require` that fails, so a caught one is only unknown.
    const ref = context.collector.guards.isCaught() ? undefined : dynamicRequire;
    context.collector.dynamic(
      ref,
      'require(<expression>)',
      computedModuleReason,
      node.start,
      false,
      context.supplied.has(node),
    );
    context.visit(argument);
    return;
  }
  recordMissing(specifier, 'require', context, () => {
    context.collector.native(specifier, argument.start);
    const module = builtinName(specifier);
    if (module !== undefined) {
      context.useRef(moduleRef(module), argument.start);
    }
  });
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

/** Records the load of a module by a function that only returns a `require()` of it. */
function recordRequired(
  loaded: { specifier: string; caught: boolean },
  offset: number,
  context: VisitContext,
): void {
  const module = builtinName(loaded.specifier);
  const record = (): void => {
    context.collector.native(loaded.specifier, offset);
    if (module !== undefined) {
      context.useRef(moduleRef(module), offset);
    }
  };
  // The function has a `try` that stops the error of a module that is missing.
  if (loaded.caught) {
    context.collector.guards.caught(record);
  } else {
    record();
  }
}

/**
 * A call of a function that only returns a `require()` loads that module, and so does a call of
 * one of the functions of an object of such functions. The `require()` inside them records nothing.
 */
function visitWrappedRequire(node: NodeOf<'CallExpression'>, context: VisitContext): boolean {
  if (context.wrappers.requires.has(node)) {
    return true;
  }
  const loaded = context.wrappers.requireCalls.get(node);
  const several = context.wrappers.loaderCalls.get(node) ?? (loaded === undefined ? [] : [loaded]);
  for (const load of several) {
    recordRequired(load, node.start, context);
  }
  return loaded !== undefined || context.wrappers.loaderCalls.has(node);
}

export const visitCall: Visitor<NodeOf<'CallExpression'>> = (node, context) => {
  recordDynamicFunction(node, context);
  if (visitWrappedRequire(node, context)) {
    return;
  }
  recordWasmBytes(node, context);
  if (isRequire(node.callee, context.scope)) {
    visitRequire(node, context);
    return;
  }
  const wrapped = context.wrappers.calls.get(node);
  if (wrapped !== undefined) {
    recordImport(wrapped, node.arguments[0]?.start ?? node.start, context);
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

/** Records the load of `specifier`, as `import()` of it does. */
function recordImport(specifier: string, offset: number, context: VisitContext): void {
  const module = builtinName(specifier);
  // Only an awaited import can be caught by a `try`; a promise nothing awaits fails on its own.
  const record = (): void => {
    context.collector.native(specifier, offset);
    if (module !== undefined) {
      context.useRef(moduleRef(module), offset);
    }
  };
  const run = (): void => {
    recordMissing(specifier, 'import', context, record);
  };
  if (context.parent()?.type === 'AwaitExpression') {
    run();
  } else {
    context.collector.guards.deferred(run);
  }
}

export const visitImportExpression: Visitor<NodeOf<'ImportExpression'>> = (node, context) => {
  if (context.wrappers.imports.has(node)) {
    return;
  }
  const specifier = moduleSpecifier(node.source, context.scope);
  if (specifier === undefined) {
    context.collector.dynamic(
      undefined,
      'import(<expression>)',
      computedModuleReason,
      node.start,
      false,
      context.supplied.has(node),
    );
    context.visitChildren(node);
    return;
  }
  recordImport(specifier, node.source.start, context);
};

export const visitNew: Visitor<NodeOf<'NewExpression'>> = (node, context) => {
  recordDynamicFunction(node, context);
  context.visitChildren(node);
};
