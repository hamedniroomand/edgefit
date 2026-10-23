import type { Node } from 'oxc-parser';

import { isNullish } from './api-guards.ts';
import { strip } from './ast.ts';
import { foldedString } from './bindings.ts';
import type { BindingContext } from './bindings.ts';
import { heldCheck } from './checks.ts';
import type { VisitContext } from './context.ts';
import type { Guard } from './guard-stack.ts';
import { guardsWhen } from './guards.ts';
import type { Scope } from './scope.ts';

/** A test that decides a branch, and the scope that the names in the test belong to. */
type BranchTest = { test: Node; truth: boolean; scope: Scope };

/** One module name that a conditional can give, and the tests that must hold to give it. */
export type SpecifierBranch = { specifier: string; tests: readonly BranchTest[] };

// ponytail: a conditional nested deeper than this is not followed, so the call stays unknown. The
// limit also ends a loop of consts that name each other. Real code has a few branches. Upgrade:
// raise the limit when a package needs it.
const maxDepth = 8;

function branchesOf(
  node: Node,
  scope: Scope,
  tests: readonly BranchTest[],
  depth: number,
): SpecifierBranch[] | undefined {
  const inner = strip(node);
  if (depth > maxDepth) {
    return undefined;
  }
  if (inner.type === 'ConditionalExpression') {
    const given = branchesOf(
      inner.consequent,
      scope,
      [...tests, { test: inner.test, truth: true, scope }],
      depth + 1,
    );
    const otherwise = branchesOf(
      inner.alternate,
      scope,
      [...tests, { test: inner.test, truth: false, scope }],
      depth + 1,
    );
    return given === undefined || otherwise === undefined ? undefined : [...given, ...otherwise];
  }
  // A branch that gives no value loads nothing. Code that passes it on checks for it first.
  if (isNullish(inner)) {
    return [];
  }
  const specifier = foldedString(inner, scope);
  if (specifier !== undefined) {
    return [{ specifier, tests }];
  }
  // Only a `const` is followed, as for a string: a `let` or a `var` may hold another value later.
  const held = inner.type === 'Identifier' ? heldCheck(scope, inner.name) : undefined;
  return held === undefined || held.call || held.region !== undefined
    ? undefined
    : branchesOf(held.test, held.scope, tests, depth + 1);
}

/**
 * Each module name that a conditional can give, directly or through a `const`:
 * `flag ? 'a' : 'b'`. Returns `undefined` when a branch is neither a string nor a value that gives
 * nothing, so the name stays computed, and when no branch gives a string.
 */
export function specifierBranches(node: Node, scope: Scope): SpecifierBranch[] | undefined {
  const branches = branchesOf(node, scope, [], 0);
  return branches === undefined || branches.length === 0 ? undefined : branches;
}

/** What is known where the branch runs: the same facts that an `if` with each of its tests gives. */
export function branchGuards(branch: SpecifierBranch, context: BindingContext): Guard[] {
  return branch.tests.flatMap(({ test, truth, scope }) =>
    guardsWhen(
      test,
      truth,
      scope === context.scope
        ? context
        : {
            imported: context.imported,
            scope,
            globals: context.globals,
            nodeEnv: context.nodeEnv,
            wrappers: context.wrappers,
          },
    ),
  );
}

/**
 * Records each module that a conditional name can load, where its tests say it runs. Returns false
 * when the name is not a conditional of strings, and records nothing then.
 */
export function recordBranches(
  name: Node,
  context: VisitContext,
  record: (specifier: string) => void,
): boolean {
  const branches = specifierBranches(name, context.scope);
  if (branches === undefined) {
    return false;
  }
  for (const branch of branches) {
    context.collector.guards.within(branchGuards(branch, context), () => {
      record(branch.specifier);
    });
  }
  return true;
}
