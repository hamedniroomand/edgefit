import type { Node } from 'oxc-parser';

import type { NodeOf } from '@/extract/ast.ts';
import { resolveBinding } from '@/extract/bindings.ts';
import type { VisitContext, Visitor } from '@/extract/context.ts';
import { guardsAfter, guardsWhen } from '@/extract/guards.ts';
import { isTracked } from '@/extract/scope.ts';

export const visitIf: Visitor<NodeOf<'IfStatement'>> = (node, context) => {
  context.visit(node.test);
  context.collector.guards.within(guardsWhen(node.test, true, context), () => {
    context.visit(node.consequent);
  });
  context.collector.guards.within(guardsWhen(node.test, false, context), () => {
    context.visit(node.alternate);
  });
};

export const visitConditional: Visitor<NodeOf<'ConditionalExpression'>> = (node, context) => {
  context.visit(node.test);
  context.collector.guards.within(guardsWhen(node.test, true, context), () => {
    context.visit(node.consequent);
  });
  context.collector.guards.within(guardsWhen(node.test, false, context), () => {
    context.visit(node.alternate);
  });
};

export const visitLogical: Visitor<NodeOf<'LogicalExpression'>> = (node, context) => {
  context.visit(node.left);
  // `a && b` runs b when a is truthy, and `a || b` runs b when a is falsy.
  const guards =
    node.operator === '??' ? [] : guardsWhen(node.left, node.operator === '&&', context);
  context.collector.guards.within(guards, () => {
    context.visit(node.right);
  });
};

/** The callee of `x.y?.()` is only used when it exists. */
export function visitOptionalCallee(
  node: NodeOf<'CallExpression'>,
  context: VisitContext,
): boolean {
  if (!node.optional || !isTracked(resolveBinding(node.callee, context))) {
    return false;
  }
  context.collector.guards.within(guardsWhen(node.callee, true, context), () => {
    context.visitChildren(node);
  });
  return true;
}

/** Visits statements in order, and lets a guard clause protect the statements after it. */
export function visitStatements(statements: readonly Node[], context: VisitContext): void {
  context.collector.guards.scoped(add => {
    for (const statement of statements) {
      context.visit(statement);
      if (statement.type === 'IfStatement') {
        add(guardsAfter(statement, context));
      }
    }
  });
}
