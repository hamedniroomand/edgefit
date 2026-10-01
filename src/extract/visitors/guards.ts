import type { Node } from 'oxc-parser';

import type { NodeOf } from '@/extract/ast.ts';
import { resolveBinding } from '@/extract/bindings.ts';
import { collectChecks } from '@/extract/checks.ts';
import type { VisitContext, Visitor } from '@/extract/context.ts';
import { catches } from '@/extract/guard-stack.ts';
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

/**
 * A `catch` that does not throw again stops the error of using something the target lacks, so the
 * `try` block counts as guarded for what is absent. The `catch` and `finally` blocks do not.
 */
export const visitTry: Visitor<NodeOf<'TryStatement'>> = (node, context) => {
  if (catches(node)) {
    context.collector.guards.caught(() => {
      context.visit(node.block);
    });
  } else {
    context.visit(node.block);
  }
  context.visit(node.handler);
  context.visit(node.finalizer);
};

/** Visits statements in order, and lets a guard clause protect the statements after it. */
export function visitStatements(statements: readonly Node[], context: VisitContext): void {
  collectChecks(statements, context.scope);
  context.collector.guards.scoped(add => {
    for (const statement of statements) {
      context.visit(statement);
      if (statement.type === 'IfStatement') {
        add(guardsAfter(statement, context));
      }
    }
  });
}
