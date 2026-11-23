import type { Node } from 'oxc-parser';

import { isFunction, strip, stringLiteral } from './ast.ts';
import type { FunctionNode } from './ast.ts';
import { constantOf } from './constants.ts';
import { lookupCheck } from './scope.ts';
import type { Check, Scope } from './scope.ts';
import { namesSetAgain } from './set-again.ts';
import { staticChecks } from './static-checks.ts';

type Returned = { test: Node; negated: boolean };

/** The value of `return true;` or `return false;`, alone or as the only statement of a block. */
function returnedBoolean(statement: Node | null | undefined): boolean | undefined {
  const only =
    statement?.type === 'BlockStatement' && statement.body.length === 1
      ? statement.body[0]
      : statement;
  const value =
    only?.type === 'ReturnStatement' && only.argument !== null ? strip(only.argument) : undefined;
  // A minifier writes `true` and `false` as `!0` and `!1`.
  const constant = value === undefined ? undefined : constantOf(value);
  return typeof constant?.value === 'boolean' ? constant.value : undefined;
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

/** The string that `statement` returns: `return 'deno';`, alone or as the only statement of a block. */
function returnedString(statement: Node | null | undefined): string | undefined {
  const only =
    statement?.type === 'BlockStatement' && statement.body.length === 1
      ? statement.body[0]
      : statement;
  return only?.type === 'ReturnStatement' && only.argument !== null
    ? stringLiteral(only.argument)
    : undefined;
}

/**
 * For a helper without parameters that is a list of `if (test) return 'value';` and a last
 * `return 'other';`: the test behind each string that one `if` alone returns. A string that more
 * than one `return` gives tells nothing, so it is left out.
 */
function returnedValues(fn: FunctionNode): ReadonlyMap<string, Node> | undefined {
  if (fn.async || fn.generator || fn.params.length > 0 || fn.body?.type !== 'BlockStatement') {
    return undefined;
  }
  const tests = new Map<string, Node>();
  const seen = new Set<string>();
  const body = fn.body.body;
  for (const [index, statement] of body.entries()) {
    const last = index === body.length - 1;
    const value =
      statement.type === 'IfStatement' && statement.alternate === null
        ? returnedString(statement.consequent)
        : last
          ? returnedString(statement)
          : undefined;
    if (value === undefined) {
      return undefined;
    }
    if (seen.has(value)) {
      tests.delete(value);
    } else if (statement.type === 'IfStatement') {
      tests.set(value, statement.test);
    }
    seen.add(value);
  }
  return tests.size === 0 ? undefined : tests;
}

/** The check that a helper without parameters holds: what it returns, or the strings it returns. */
function helperCheck(fn: FunctionNode, scope: Scope): Check | undefined {
  const returned = returnedValue(fn);
  const values = returnedValues(fn);
  if (returned !== undefined) {
    return { ...returned, call: true, scope, busy: false, region: undefined };
  }
  return values === undefined
    ? undefined
    : {
        test: fn,
        negated: false,
        call: true,
        scope,
        busy: false,
        region: undefined,
        values,
        valuesOnly: true,
      };
}

/** The check that a declared value holds: a helper's, or the value itself as a test. */
function declaredCheck(init: Node, scope: Scope): Check | undefined {
  const value = strip(init);
  return isFunction(value)
    ? helperCheck(value, scope)
    : { test: init, negated: false, call: false, scope, busy: false, region: undefined };
}

/** The statements that hold a `var`: the body of the nearest function, static block or file. */
function varBody(scope: Scope | undefined, statements: readonly Node[]): readonly Node[] {
  return scope === undefined ? statements : (scope.body ?? varBody(scope.parent, statements));
}

/**
 * Remembers the checks a block declares, so a `const`, a `let` that the block does not set again,
 * a `var` that its function does not set again, or a helper without parameters that holds one can
 * stand in for it: `const isDeno = typeof Deno !== 'undefined'`, or
 * `function hasWatch() { return typeof fs.watch === 'function'; }`.
 * ponytail: a helper with parameters is not followed; substituting them needs the call's arguments.
 */
export function collectChecks(statements: readonly Node[], scope: Scope): void {
  for (const statement of statements) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type === 'FunctionDeclaration' && declaration.id !== null) {
      const check = helperCheck(declaration, scope);
      if (check !== undefined) {
        scope.checks.set(declaration.id.name, check);
      }
    } else if (declaration?.type === 'ClassDeclaration') {
      staticChecks(declaration, statement !== declaration, statements, scope, helperCheck);
    } else if (declaration?.type === 'VariableDeclaration') {
      // The block stays in the region of a `var`: a `catch` parameter of the same name hides the
      // writes in the block from the scan of the function body.
      const region =
        declaration.kind === 'const'
          ? undefined
          : declaration.kind === 'var'
            ? [statements, varBody(scope, statements)]
            : [statements];
      for (const { id, init } of declaration.declarations) {
        if (id.type !== 'Identifier' || init === null) {
          continue;
        }
        const check = declaredCheck(init, scope);
        if (check !== undefined) {
          scope.checks.set(id.name, { ...check, region });
        }
      }
    }
  }
}

/** The check a name holds, unless the name is a `let` or `var` that its region sets again. */
export function heldCheck(scope: Scope | undefined, name: string): Check | undefined {
  const check = lookupCheck(scope, name);
  return check?.region?.some(statements => namesSetAgain(statements).has(name)) === true
    ? undefined
    : check;
}
