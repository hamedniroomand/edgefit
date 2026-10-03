import type { Node } from 'oxc-parser';

import { builtinName } from '@/data/builtins.ts';
import { isSymbolKey, staticKey, staticString, strip } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { resolveBinding } from '@/extract/bindings.ts';
import type { VisitContext, Visitor } from '@/extract/context.ts';
import { displayRef, isGlobalRoot, memberRef, moduleRef } from '@/extract/refs.ts';
import { assign, isBound, lookup, lookupStringObject } from '@/extract/scope.ts';
import type { Binding } from '@/extract/scope.ts';
import { destructuredLoad } from '@/trace/dynamic-imports.ts';
import type { ApiRef } from '@/types.ts';

type DestructuredProperty = NodeOf<'ObjectPattern'>['properties'][number];

function bindTarget(target: Node, ref: ApiRef, context: VisitContext, recorded = true): void {
  let binding = target;
  if (binding.type === 'AssignmentPattern') {
    context.visit(binding.right);
    binding = binding.left;
  }
  if (binding.type === 'Identifier') {
    assign(context.scope, binding.name, { ref, recorded });
  } else if (binding.type === 'ObjectPattern') {
    bindDestructured(binding, ref, context);
  } else {
    context.visitPattern(binding);
  }
}

function bindProperty(property: DestructuredProperty, ref: ApiRef, context: VisitContext): void {
  if (property.type === 'RestElement') {
    context.collector.dynamic(
      ref,
      displayRef(ref),
      'collected with a rest element',
      property.start,
    );
    context.visitPattern(property.argument);
    return;
  }
  const key = staticKey(property.key, property.computed);
  if (key === undefined) {
    context.visit(property.key);
    context.collector.dynamic(
      ref,
      `${displayRef(ref)}[<expression>]`,
      'destructured with a computed key',
      property.key.start,
    );
    context.visitPattern(property.value);
    return;
  }
  const member = memberRef(ref, key);
  // `const { process } = globalThis` only reads a property that may not exist, and code that does
  // this usually checks the value before it uses it. What counts is where the name is used.
  const recorded = !isGlobalRoot(ref);
  if (recorded) {
    context.collector.api(member, property.key.start);
  }
  bindTarget(property.value, member, context, recorded);
}

/** `const { promises: { watch } } = fs` binds `watch` to `fs.promises.watch`. */
function bindDestructured(
  pattern: NodeOf<'ObjectPattern'>,
  ref: ApiRef,
  context: VisitContext,
): void {
  for (const property of pattern.properties) {
    bindProperty(property, ref, context);
  }
}

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

/** `const { crypto } = await import('./file')` or `require('./file')` binds the names that another file exports as a Node.js module. */
function bindLoadedNames(node: NodeOf<'VariableDeclarator'>, context: VisitContext): void {
  for (const kind of ['import', 'require'] as const) {
    const found = destructuredLoad(node, kind);
    for (const [local, name] of found?.names ?? []) {
      const alias = context.collector.importedModules.get(`${found?.specifier ?? ''}\0${name}`);
      if (alias !== undefined) {
        assign(context.scope, local, { ref: alias, recorded: false });
      }
    }
  }
}

export const visitDeclarator: Visitor<NodeOf<'VariableDeclarator'>> = (node, context) => {
  const { id, init } = node;
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

/** The values of an object literal when every one is a plain string. */
function stringValues(node: Node | null): string[] | undefined {
  if (node?.type !== 'ObjectExpression') {
    return undefined;
  }
  const values = node.properties.map(property =>
    property.type === 'Property' ? staticString(property.value) : undefined,
  );
  // An object with no value gives an empty set, and silence is not an answer.
  return values.length > 0 && values.every(value => value !== undefined)
    ? (values as string[])
    : undefined;
}

/**
 * Remembers what a `const` may hold when that is a known set of strings: `const name = 'text'`,
 * an object of strings, or `const key = object[something]` of such an object.
 */
function recordKeys(name: string, init: Node | null, context: VisitContext): void {
  const value = staticString(init);
  const values = stringValues(init);
  const inner = init === null ? undefined : strip(init);
  const object =
    inner?.type === 'MemberExpression' && inner.computed && inner.object.type === 'Identifier'
      ? lookupStringObject(context.scope, inner.object.name)
      : undefined;
  if (value !== undefined) {
    context.scope.keys.set(name, [value]);
  } else if (values !== undefined) {
    context.scope.stringObjects.set(name, values);
  } else if (object !== undefined) {
    context.scope.keys.set(name, object);
  }
}

/** Remembers `const name = 'text'`, so `import(name)` can be read like `import('text')`. */
export const visitDeclaration: Visitor<NodeOf<'VariableDeclaration'>> = (node, context) => {
  if (node.kind === 'const') {
    for (const { id, init } of node.declarations) {
      const value = id.type === 'Identifier' ? staticString(init) : undefined;
      if (id.type === 'Identifier') {
        recordKeys(id.name, init, context);
      }
      if (id.type === 'Identifier' && value !== undefined) {
        context.scope.strings.set(id.name, value);
      } else if (id.type === 'Identifier' && init !== null && isSymbolKey(init)) {
        context.scope.symbols.add(id.name);
      }
    }
  }
  context.visitChildren(node);
};
