import type { Node } from 'oxc-parser';

import { builtinName } from '@/data/builtins.ts';
import { isSymbolKey, staticKey, strip } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { foldedString, resolveBinding } from '@/extract/bindings.ts';
import type { VisitContext, Visitor } from '@/extract/context.ts';
import { moduleRef } from '@/extract/refs.ts';
import { isGlobal } from '@/extract/runtimes.ts';
import { assign, isBound, lookup } from '@/extract/scope.ts';
import type { Binding } from '@/extract/scope.ts';
import type { ApiRef } from '@/types.ts';

import {
  bindDestructured,
  bindFileNamespace,
  bindLoadedNames,
  bindTarget,
  bindWholeExport,
} from './binders.ts';

/** What `let c;` holds, when `c = value` is the one write to `c` in the file. */
function assignedBinding(id: Node, context: VisitContext): Binding | undefined {
  const value = id.type === 'Identifier' ? context.assigned.get(id.name) : undefined;
  return value === undefined
    ? undefined
    : (wrapperBinding(value, context) ?? resolveBinding(value, context));
}

/** What `const m = load()` holds when `load` only returns a `require()` of a Node.js module. */
function wrapperBinding(init: Node, context: VisitContext): Binding | undefined {
  const loaded = context.wrappers.requireCalls.get(strip(init));
  const module = loaded === undefined ? undefined : builtinName(loaded.specifier);
  return module === undefined ? undefined : { ref: moduleRef(module), recorded: false };
}

/** The array literal of `Promise.all([…])`, whether or not the call is awaited. */
function promiseAllList(
  init: Node | null,
  context: VisitContext,
): NodeOf<'ArrayExpression'> | undefined {
  const call = init === null ? undefined : strip(init);
  const callee = call?.type === 'CallExpression' ? strip(call.callee) : undefined;
  const list = call?.type === 'CallExpression' ? call.arguments[0] : undefined;
  return callee?.type === 'MemberExpression' &&
    staticKey(callee.property, callee.computed) === 'all' &&
    isGlobal(callee.object, 'Promise', context) &&
    list?.type === 'ArrayExpression'
    ? list
    : undefined;
}

/**
 * `const [a, b] = await Promise.all([x, y])` binds `a` to what `x` is and `b` to what `y` is.
 * A name, or an object pattern, binds when its value is a module that edgefit tracks. The elements from the first spread
 * or hole on are not matched by position, and neither is a rest element, so those names stay unbound.
 */
function bindPromiseAll(node: NodeOf<'VariableDeclarator'>, context: VisitContext): boolean {
  const { id, init } = node;
  const list = id.type === 'ArrayPattern' ? promiseAllList(init, context) : undefined;
  if (id.type !== 'ArrayPattern' || list === undefined || init === null) {
    return false;
  }
  const ordered = list.elements.findIndex(
    element => element === null || element.type === 'SpreadElement',
  );
  const matched = ordered === -1 ? list.elements : list.elements.slice(0, ordered);
  const bound = new Map<Node, { target: Node; ref: ApiRef }>();
  for (const [index, element] of matched.entries()) {
    const target = id.elements[index];
    const value = element === null ? undefined : resolveBinding(element, context);
    const names = target?.type === 'Identifier' || target?.type === 'ObjectPattern';
    if (element !== null && names && isBound(value) && value !== 'require') {
      bound.set(element, { target, ref: value.ref });
    }
  }
  if (bound.size === 0) {
    return false;
  }
  context.visitPattern(id);
  context.visitBound(init, [...bound.keys()]);
  for (const { target, ref } of bound.values()) {
    bindTarget(target, ref, context, false);
  }
  return true;
}

export const visitDeclarator: Visitor<NodeOf<'VariableDeclarator'>> = (node, context) => {
  const { id, init } = node;
  if (bindWholeExport(node, context) || bindFileNamespace(node, context)) {
    return;
  }
  if (bindPromiseAll(node, context)) {
    return;
  }
  bindLoadedNames(node, context);
  const initial =
    init === null ? undefined : (wrapperBinding(init, context) ?? resolveBinding(init, context));
  const binding = isBound(initial) ? initial : assignedBinding(id, context);
  if (!isBound(binding)) {
    context.visitPattern(id);
    context.visit(init);
    return;
  }
  if (id.type === 'Identifier') {
    assign(
      context.scope,
      id.name,
      binding === 'require' ? binding : { ref: binding.ref, recorded: false },
    );
    if (init !== null) {
      if (isBound(initial)) {
        context.visitBound(init);
      } else {
        context.visit(init);
      }
    }
    return;
  }
  context.visit(init);
  if (binding !== 'require' && id.type === 'ObjectPattern') {
    bindDestructured(id, binding.ref, context);
  } else {
    context.visitPattern(id);
  }
};

/**
 * `({ watch } = require('node:fs'))` binds each name to the member it reads, as
 * `const { watch } = require('node:fs')` does. A load of another file only binds the names.
 */
export function bindDestructuredAssignment(
  node: NodeOf<'AssignmentExpression'>,
  context: VisitContext,
): boolean {
  if (node.operator !== '=') {
    return false;
  }
  bindLoadedNames(node, context);
  const binding = resolveBinding(node.right, context);
  if (!isBound(binding) || binding === 'require' || node.left.type !== 'ObjectPattern') {
    return false;
  }
  context.visit(node.right);
  bindDestructured(node.left, binding.ref, context);
  return true;
}

/**
 * The one write to a name that `let c;` bound to a module, as in `let c; c = require('fs')`.
 * It is followed unless its value is used by the code around it, as in `use((c = require('fs')))`.
 * The declaration read the value in its own scope, so a name that this scope shadows unbinds `c`.
 */
export function bindAssigned(node: NodeOf<'AssignmentExpression'>, context: VisitContext): boolean {
  const { left, right } = node;
  if (
    left.type !== 'Identifier' ||
    node.operator !== '=' ||
    context.assigned.get(left.name) !== right ||
    !isBound(lookup(context.scope, left.name))
  ) {
    return false;
  }
  if (!isBound(wrapperBinding(right, context) ?? resolveBinding(right, context))) {
    assign(context.scope, left.name, null);
    return false;
  }
  if (context.parent()?.type !== 'ExpressionStatement') {
    return false;
  }
  context.visitBound(right);
  return true;
}

/** Remembers `const name = 'text'`, so `import(name)` can be read like `import('text')`. */
export const visitDeclaration: Visitor<NodeOf<'VariableDeclaration'>> = (node, context) => {
  if (node.kind === 'const') {
    for (const { id, init } of node.declarations) {
      const value = id.type === 'Identifier' ? foldedString(init, context.scope) : undefined;
      if (id.type === 'Identifier' && value !== undefined) {
        context.scope.strings.set(id.name, value);
      } else if (id.type === 'Identifier' && init !== null && isSymbolKey(init)) {
        context.scope.symbols.add(id.name);
      }
    }
  }
  context.visitChildren(node);
};
