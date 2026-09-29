import type { NodeOf } from '@/extract/ast.ts';
import type { Visitor } from '@/extract/context.ts';
import { globalRef } from '@/extract/refs.ts';
import { lookup } from '@/extract/scope.ts';

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

export const visitAssignment: Visitor<NodeOf<'AssignmentExpression'>> = (node, context) => {
  // Writing to a plain name neither reads it nor changes what edgefit tracks.
  if (node.left.type === 'Identifier') {
    context.collector.guards.drop(node.left.name);
  } else {
    context.visitPattern(node.left);
  }
  context.visit(node.right);
};

export const visitUpdate: Visitor<NodeOf<'UpdateExpression'>> = (node, context) => {
  if (node.argument.type !== 'Identifier') {
    context.visit(node.argument);
  }
};

export const visitLabeled: Visitor<NodeOf<'LabeledStatement'>> = (node, context) => {
  context.visit(node.body);
};

export const skip: Visitor = () => {
  // Labels and `import.meta` hold no references.
};
