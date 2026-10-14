import type { Node } from 'oxc-parser';

import { isFunction, strip } from './ast.ts';
import type { FunctionNode } from './ast.ts';
import { lookupCheck } from './scope.ts';
import type { Check, Scope } from './scope.ts';
import { namesSetAgain } from './set-again.ts';

type Returned = { test: Node; negated: boolean };

/** The value of `return true;` or `return false;`, alone or as the only statement of a block. */
function returnedBoolean(statement: Node | null | undefined): boolean | undefined {
  const only =
    statement?.type === 'BlockStatement' && statement.body.length === 1
      ? statement.body[0]
      : statement;
  const value =
    only?.type === 'ReturnStatement' && only.argument !== null ? strip(only.argument) : undefined;
  return value?.type === 'Literal' && typeof value.value === 'boolean' ? value.value : undefined;
}

/** `if (c) return true; return false;`, also with an `else`, or with the two values swapped. */
function ifReturnsBoolean(body: readonly Node[]): Returned | undefined {
  const [first, second, ...rest] = body;
  if (first?.type !== 'IfStatement' || rest.length > 0) {
    return undefined;
  }
  const then = returnedBoolean(first.consequent);
  const otherwise =
    first.alternate === null
      ? returnedBoolean(second)
      : second === undefined
        ? returnedBoolean(first.alternate)
        : undefined;
  return then === undefined || otherwise === undefined || then === otherwise
    ? undefined
    : { test: first.test, negated: !then };
}

/**
 * What a helper without parameters returns: one value, such as `() => typeof Deno !== 'undefined'`,
 * or a test that decides a `return true` or a `return false`.
 */
function returnedValue(fn: FunctionNode): Returned | undefined {
  if (fn.async || fn.generator || fn.params.length > 0 || fn.body === null) {
    return undefined;
  }
  if (fn.body.type !== 'BlockStatement') {
    return { test: fn.body, negated: false };
  }
  const [only, ...rest] = fn.body.body;
  if (rest.length === 0 && only?.type === 'ReturnStatement') {
    return only.argument === null ? undefined : { test: only.argument, negated: false };
  }
  return ifReturnsBoolean(fn.body.body);
}

/**
 * Remembers the checks a block declares, so a `const`, a `let` or `var` that the block does not set
 * again, or a helper without parameters that holds one can stand in for it:
 * `const isDeno = typeof Deno !== 'undefined'`, or
 * `function hasWatch() { return typeof fs.watch === 'function'; }`.
 * ponytail: a helper with parameters is not followed; substituting them needs the call's arguments.
 * ponytail: the scan of a `var` in a nested block covers writes in that block only, so a closure in
 * the block can miss a write outside it. Upgrade: scan the enclosing function body for a `var`.
 */
export function collectChecks(statements: readonly Node[], scope: Scope): void {
  for (const statement of statements) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type === 'FunctionDeclaration' && declaration.id !== null) {
      const returned = returnedValue(declaration);
      if (returned !== undefined) {
        scope.checks.set(declaration.id.name, {
          ...returned,
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
        const returned = helper ? returnedValue(value) : { test: init, negated: false };
        if (returned !== undefined) {
          scope.checks.set(id.name, { ...returned, call: helper, scope, busy: false, region });
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
