import type { Node } from 'oxc-parser';

import { isFunction, strip } from './ast.ts';
import type { FunctionNode } from './ast.ts';
import { lookupCheck } from './scope.ts';
import type { Check, Scope } from './scope.ts';
import { namesSetAgain } from './set-again.ts';

/** The body of a helper that only returns a value, such as `() => typeof Deno !== 'undefined'`. */
function returnedValue(fn: FunctionNode): Node | undefined {
  if (fn.async || fn.generator || fn.params.length > 0 || fn.body === null) {
    return undefined;
  }
  if (fn.body.type !== 'BlockStatement') {
    return fn.body;
  }
  const [only, ...rest] = fn.body.body;
  return rest.length === 0 && only?.type === 'ReturnStatement'
    ? (only.argument ?? undefined)
    : undefined;
}

/**
 * Remembers the checks a block declares, so a `const`, a `let` or `var` that the block does not set
 * again, or a helper without parameters that holds one can stand in for it:
 * `const isDeno = typeof Deno !== 'undefined'`, or
 * `function hasWatch() { return typeof fs.watch === 'function'; }`.
 * ponytail: a helper with parameters is not followed; substituting them needs the call's arguments.
 * ponytail: a `var` in a nested block is checked for writes in that block only, so a closure in the
 * block can miss a write outside it. Upgrade: scan the enclosing function body for a `var`.
 */
export function collectChecks(statements: readonly Node[], scope: Scope): void {
  for (const statement of statements) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type === 'FunctionDeclaration' && declaration.id !== null) {
      const test = returnedValue(declaration);
      if (test !== undefined) {
        scope.checks.set(declaration.id.name, {
          test,
          call: true,
          scope,
          busy: false,
          region: undefined,
        });
      }
    } else if (declaration?.type === 'VariableDeclaration') {
      const region = declaration.kind === 'const' ? undefined : statements;
      for (const { id, init } of declaration.declarations) {
        if (id.type !== 'Identifier' || init === null) {
          continue;
        }
        const value = strip(init);
        const helper = isFunction(value);
        const test = helper ? returnedValue(value) : init;
        if (test !== undefined) {
          scope.checks.set(id.name, { test, call: helper, scope, busy: false, region });
        }
      }
    }
  }
}

/** The check a name holds, unless the name is a `let` or `var` that its block sets again. */
export function heldCheck(scope: Scope | undefined, name: string): Check | undefined {
  const check = lookupCheck(scope, name);
  return check?.region !== undefined && namesSetAgain(check.region).has(name) ? undefined : check;
}
