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

/** The nodes that pass a value on unchanged. */
const passThrough = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'AwaitExpression',
]);

const patterns = new Set(['ObjectPattern', 'ArrayPattern']);

/** Whether `parent` passes the value of `child` on as its own value, so the use of `parent` decides. */
function passesOn(child: Node, parent: Node): boolean {
  if (passThrough.has(parent.type)) {
    return true;
  }
  if (parent.type === 'ConditionalExpression') {
    return parent.consequent === child || parent.alternate === child;
  }
  if (parent.type === 'LogicalExpression') {
    return parent.right === child;
  }
  return parent.type === 'SequenceExpression' && parent.expressions.at(-1) === child;
}

/** Whether `parent` destructures `child`: `const { a } = child`, `({ a } = child)` or a default. */
function destructures(child: Node, parent: Node): boolean {
  if (parent.type === 'VariableDeclarator') {
    return parent.init === child && patterns.has(parent.id.type);
  }
  if (parent.type === 'AssignmentExpression') {
    return parent.right === child && parent.operator === '=' && patterns.has(parent.left.type);
  }
  return (
    parent.type === 'AssignmentPattern' && parent.right === child && patterns.has(parent.left.type)
  );
}

/** Whether `parent` uses `child` in a way that throws when it is `undefined`. */
function throwsAt(child: Node, parent: Node, grandparent: Node | undefined): boolean {
  if (destructures(child, parent)) {
    return true;
  }
  if (parent.type === 'NewExpression') {
    return parent.callee === child;
  }
  if (parent.type === 'CallExpression') {
    // A new `?.` after the chain, as in `(x.y?.())?.()`, skips the call too.
    return parent.callee === child && !parent.optional;
  }
  if (parent.type === 'TaggedTemplateExpression') {
    return parent.tag === child;
  }
  if (parent.type === 'ForOfStatement') {
    return parent.right === child;
  }
  if (parent.type === 'YieldExpression') {
    return parent.delegate;
  }
  if (parent.type === 'BinaryExpression') {
    return parent.right === child && (parent.operator === 'in' || parent.operator === 'instanceof');
  }
  if (parent.type === 'SpreadElement') {
    // `{ ...undefined }` gives `{}`. A spread into a list or a call throws.
    return grandparent?.type !== 'ObjectExpression';
  }
  return parent.type === 'MemberExpression' && parent.object === child && !parent.optional;
}

/** Whether `parent` is a link of the optional chain that `child` is in: `?.` skips it too. */
function isChainLink(child: Node, parent: Node): boolean {
  return (
    (parent.type === 'MemberExpression' && parent.object === child) ||
    (parent.type === 'CallExpression' && parent.callee === child) ||
    parent.type === 'TSNonNullExpression'
  );
}

/**
 * Whether the code uses the value of `node`, the call `x.y?.()`, in a way that throws when it is
 * `undefined`. Inside the chain, a member read or a call after it is skipped too, so the value of
 * the whole chain counts: destructuring it, `new`, a call, `for … of`, `in`, `instanceof`, a tagged
 * template, `yield*`, a spread into a list or a call, or a member read after the chain.
 */
function throwsOnUndefined(node: Node, ancestors: readonly Node[]): boolean {
  let child = node;
  let inChain = true;
  for (const [index, parent] of ancestors.entries()) {
    if (inChain && parent.type === 'ChainExpression') {
      inChain = false;
    } else if (inChain ? !isChainLink(child, parent) : !passesOn(child, parent)) {
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
