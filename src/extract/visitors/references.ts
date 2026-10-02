import type { NodeOf } from '@/extract/ast.ts';
import { resolveBinding } from '@/extract/bindings.ts';
import type { VisitContext, Visitor } from '@/extract/context.ts';
import { globalRef, normalizeRef } from '@/extract/refs.ts';
import { isTracked, lookup } from '@/extract/scope.ts';
import type { ApiRef } from '@/types.ts';

import { bindAssigned } from './declarators.ts';

export const visitIdentifier: Visitor<NodeOf<'Identifier'>> = (node, context) => {
  const binding = lookup(context.scope, node.name);
  if (binding === null || binding === 'require') {
    return;
  }
  if (binding !== undefined) {
    context.useRef(binding.ref, node.start, !binding.recorded);
  } else if (context.globals.has(node.name)) {
    context.useRef(globalRef(node.name), node.start);
  }
};

export const visitMember: Visitor<NodeOf<'MemberExpression'>> = (node, context) => {
  context.visit(node.object);
  context.visit(node.computed ? node.property : null);
};

export const visitProperty: Visitor<NodeOf<'Property'>> = (node, context) => {
  context.visit(node.computed ? node.key : null);
  context.visit(node.value);
};

export const visitClassMember: Visitor<
  NodeOf<'MethodDefinition' | 'PropertyDefinition' | 'AccessorProperty'>
> = (node, context) => {
  context.visitAll(node.decorators);
  context.visitAll([node.computed ? node.key : null, node.value]);
};

/** The global that `node` sets only when it is missing: `globalThis.x ??= v`, or `=` inside `if (!globalThis.x)`. */
function polyfilledGlobal(
  node: NodeOf<'AssignmentExpression'>,
  context: VisitContext,
): ApiRef | undefined {
  const binding =
    node.left.type === 'MemberExpression' ? resolveBinding(node.left, context) : undefined;
  if (!isTracked(binding)) {
    return undefined;
  }
  const ref = normalizeRef(binding.ref);
  if (ref.module !== '*globals*' || ref.path.length !== 1) {
    return undefined;
  }
  const conditional = node.operator === '??=' || node.operator === '||=';
  return conditional || (node.operator === '=' && context.collector.guards.absent(ref))
    ? ref
    : undefined;
}

export const visitAssignment: Visitor<NodeOf<'AssignmentExpression'>> = (node, context) => {
  // Writing to a plain name neither reads it nor changes what edgefit tracks.
  if (node.left.type === 'Identifier') {
    context.collector.guards.drop(node.left.name);
    if (bindAssigned(node, context)) {
      return;
    }
  } else {
    context.visitPattern(node.left);
  }
  const polyfill = polyfilledGlobal(node, context);
  if (polyfill === undefined) {
    context.visit(node.right);
  } else {
    context.collector.guards.within([{ kind: 'polyfill', ref: polyfill }], () => {
      context.visit(node.right);
    });
  }
};

export const visitUpdate: Visitor<NodeOf<'UpdateExpression'>> = (node, context) => {
  if (node.argument.type !== 'Identifier') {
    context.visit(node.argument);
  }
};

export const visitLabeled: Visitor<NodeOf<'LabeledStatement'>> = (node, context) => {
  context.visit(node.body);
};

/** An enum's own names are not references: only what its members are set to is read. */
export const visitEnum: Visitor<NodeOf<'TSEnumDeclaration'>> = (node, context) => {
  context.visit(node.body);
};

export const visitEnumMember: Visitor<NodeOf<'TSEnumMember'>> = (node, context) => {
  context.visit(node.initializer);
};

export const skip: Visitor = () => {
  // Labels and `import.meta` hold no references.
};
