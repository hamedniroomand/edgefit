import type { Node } from 'oxc-parser';

import { isSymbolKey, staticKey, staticString } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { resolveBinding } from '@/extract/bindings.ts';
import type { VisitContext, Visitor } from '@/extract/context.ts';
import { displayRef, isGlobalRoot, memberRef } from '@/extract/refs.ts';
import { assign } from '@/extract/scope.ts';
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

export const visitDeclarator: Visitor<NodeOf<'VariableDeclarator'>> = (node, context) => {
  const { id, init } = node;
  const binding = init === null ? undefined : resolveBinding(init, context);
  if (init === null || binding === undefined || binding === null) {
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
    context.visitBound(init);
    return;
  }
  context.visit(init);
  if (binding !== 'require' && id.type === 'ObjectPattern') {
    bindDestructured(id, binding.ref, context);
  } else {
    context.visitPattern(id);
  }
};

/** Remembers `const name = 'text'`, so `import(name)` can be read like `import('text')`. */
export const visitDeclaration: Visitor<NodeOf<'VariableDeclaration'>> = (node, context) => {
  if (node.kind === 'const') {
    for (const { id, init } of node.declarations) {
      const value = id.type === 'Identifier' ? staticString(init) : undefined;
      if (id.type === 'Identifier' && value !== undefined) {
        context.scope.strings.set(id.name, value);
      } else if (id.type === 'Identifier' && init !== null && isSymbolKey(init)) {
        context.scope.symbols.add(id.name);
      }
    }
  }
  context.visitChildren(node);
};
