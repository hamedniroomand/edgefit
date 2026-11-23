import type { Node } from 'oxc-parser';

import type { NodeOf } from '@/extract/ast.ts';
import { resolveBinding } from '@/extract/bindings.ts';
import { catches, missingModuleCatch } from '@/extract/catches.ts';
import { collectChecks } from '@/extract/checks.ts';
import type { VisitContext, Visitor } from '@/extract/context.ts';
import { guardsAfter, leaves, throwsGuards } from '@/extract/guards-after.ts';
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

/** The nodes that pass the value of an optional chain on unchanged. */
const passThrough = new Set([
  'ChainExpression',
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

/** Whether `parent` uses `child` in a way that throws when it is `undefined`. */
function throwsAt(child: Node, parent: Node, grandparent: Node | undefined): boolean {
  if (parent.type === 'VariableDeclarator') {
    return parent.init === child && parent.id.type !== 'Identifier';
  }
  if (parent.type === 'AssignmentExpression') {
    return (
      parent.right === child &&
      parent.operator === '=' &&
      (parent.left.type === 'ObjectPattern' || parent.left.type === 'ArrayPattern')
    );
  }
  if (parent.type === 'NewExpression' || parent.type === 'CallExpression') {
    return parent.callee === child && !(parent.type === 'CallExpression' && parent.optional);
  }
  if (parent.type === 'ForOfStatement') {
    return parent.right === child;
  }
  if (parent.type === 'SpreadElement') {
    // `{ ...undefined }` gives `{}`. A spread into a list or a call throws.
    return grandparent?.type !== 'ObjectExpression';
  }
  // `x.y?.().z` stops at `?.` inside the chain. After the chain, as in `(x.y?.()).z`, it throws.
  return (
    parent.type === 'MemberExpression' &&
    parent.object === child &&
    !parent.optional &&
    child.type !== 'CallExpression'
  );
}

/**
 * Whether the code uses the value of `node`, the call `x.y?.()`, in a way that throws when it is
 * `undefined`: destructuring, `new`, a call, `for … of`, a spread into a list or a call, or a plain
 * member read after the chain has ended.
 */
function throwsOnUndefined(node: Node, ancestors: readonly Node[]): boolean {
  let child = node;
  for (const [index, parent] of ancestors.entries()) {
    if (!passThrough.has(parent.type)) {
      return throwsAt(child, parent, ancestors[index + 1]);
    }
    child = parent;
  }
  return false;
}

/**
 * The callee of `x.y?.()` is only used when it exists. A use of the result that throws on
 * `undefined` is not protected, so it stays a finding.
 */
export function visitOptionalCallee(
  node: NodeOf<'CallExpression'>,
  context: VisitContext,
): boolean {
  if (!node.optional || !isTracked(resolveBinding(node.callee, context))) {
    return false;
  }
  if (throwsOnUndefined(node, context.ancestors())) {
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
      if (statement.type === 'FunctionDeclaration') {
        context.collector.guards.withoutThrows(() => {
          context.visit(statement);
        });
      } else {
        context.visit(statement);
      }
      dropRewrittenAlias(statements, index, context);
      // Inside a `try` that catches, the code after a call runs only when the call returned.
      if (context.collector.guards.isCaught()) {
        add(throwsGuards(statement, context));
      }
      if (statement.type === 'IfStatement') {
        add(guardsAfter(statement, context));
      } else if (statement.type === 'TryStatement') {
        add(context.collector.guards.afterTry(statement));
      }
    }
  });
}
