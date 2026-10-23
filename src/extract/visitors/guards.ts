import type { Node } from 'oxc-parser';

import type { NodeOf } from '@/extract/ast.ts';
import { resolveBinding } from '@/extract/bindings.ts';
import { catches, missingModuleCatch } from '@/extract/catches.ts';
import { collectChecks } from '@/extract/checks.ts';
import type { VisitContext, Visitor } from '@/extract/context.ts';
import { guardsAfter, leaves } from '@/extract/guards-after.ts';
import { guardsWhen } from '@/extract/guards.ts';
import { dropRewrittenAlias } from '@/extract/rewritten-alias.ts';
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
  // `a && b` runs b when a is truthy. `a || b` runs b when a is falsy, and `a ?? b` when a is
  // null or undefined, which is falsy too.
  const guards = guardsWhen(node.left, node.operator === '&&', context, node.operator === '??');
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
 *
 * The code after the `try` runs when the block ended, or when the `catch` ended. A `catch` with a
 * jump at its top level cannot end, so only the block reaches the code after the `try`, and the
 * guard clauses at the top level of the block hold there. A `finally` is not followed: the guards
 * are not on the stack while it is visited, so a write in it to the name that a guard started from
 * could not end the guard.
 */
export const visitTry: Visitor<NodeOf<'TryStatement'>> = (node, context) => {
  const { guards } = context.collector;
  const codes = missingModuleCatch(node);
  let exit: ReturnType<typeof guards.exitOf> = [];
  const visitBlock = (): void => {
    exit = guards.exitOf(() => {
      context.visit(node.block);
    });
  };
  if (catches(node)) {
    guards.caught(visitBlock);
  } else if (codes === undefined) {
    visitBlock();
  } else {
    guards.withinMissing(codes, visitBlock);
  }
  context.visit(node.handler);
  context.visit(node.finalizer);
  if (node.finalizer === null && node.handler !== null && leaves(node.handler.body)) {
    guards.leaveAfterTry(node, exit);
  }
};

/** Visits statements in order. A guard clause protects the statements after it, and a `try` statement passes on the guard clauses of its block. */
export function visitStatements(statements: readonly Node[], context: VisitContext): void {
  collectChecks(statements, context.scope);
  context.collector.guards.scoped(add => {
    for (const [index, statement] of statements.entries()) {
      context.visit(statement);
      dropRewrittenAlias(statements, index, context);
      if (statement.type === 'IfStatement') {
        add(guardsAfter(statement, context));
      } else if (statement.type === 'TryStatement') {
        add(context.collector.guards.afterTry(statement));
      }
    }
  });
}
