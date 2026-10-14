import type { Node } from 'oxc-parser';

import type { ApiRef } from '@/types.ts';

import { globalAliases, normalizeRef } from './refs.ts';
import { lookup } from './scope.ts';
import type { Scope } from './scope.ts';

const comparisons = new Set(['==', '===', '!=', '!==']);
const loops = new Set(['WhileStatement', 'DoWhileStatement', 'ForStatement']);

/** `globalThis.X`, `self.X` or `global.X`, also through a name that holds the global object. */
function isGlobalMember(ref: ApiRef): boolean {
  return (
    ref.module === '*globals*' &&
    globalAliases.has(ref.path[0] ?? '') &&
    normalizeRef(ref).path.length === 1
  );
}

/** `Boolean(x)`, where the file does not declare its own `Boolean`. */
function isBooleanCall(node: Node, parent: Node, scope: Scope): boolean {
  return (
    parent.type === 'CallExpression' &&
    parent.arguments.length === 1 &&
    parent.arguments[0] === node &&
    parent.callee.type === 'Identifier' &&
    parent.callee.name === 'Boolean' &&
    lookup(scope, 'Boolean') === undefined
  );
}

/** Whether the module exports `name` later: `export { name }` or `export default name`. */
function isExportedLater(name: string, program: Node | undefined): boolean {
  return (
    program?.type === 'Program' &&
    program.body.some(
      statement =>
        (statement.type === 'ExportNamedDeclaration' &&
          statement.source === null &&
          statement.specifiers.some(
            specifier => specifier.local.type === 'Identifier' && specifier.local.name === name,
          )) ||
        (statement.type === 'ExportDefaultDeclaration' &&
          statement.declaration.type === 'Identifier' &&
          statement.declaration.name === name),
    )
  );
}

/** The value of a `const` that the file does not export. Destructuring `undefined` throws. */
function isConstValue(node: Node, parent: Node, outer: readonly Node[]): boolean {
  const [declaration, statement] = outer;
  return (
    parent.type === 'VariableDeclarator' &&
    parent.init === node &&
    parent.id.type === 'Identifier' &&
    declaration?.type === 'VariableDeclaration' &&
    declaration.kind === 'const' &&
    statement?.type !== 'ExportNamedDeclaration' &&
    !isExportedLater(parent.id.name, outer.at(-1))
  );
}

/**
 * Whether a read of a global through the global object, such as `globalThis.Deno`, only compares
 * or keeps the value: a global that the target lacks gives `undefined`, and these uses do not
 * throw. The checks that `isFeatureCheck`, `isTestedChain` and `isCheckedOperand` know come
 * first. Every other use, such as a call, a spread or `instanceof`, still fails.
 */
export function isSafeRead(
  ref: ApiRef,
  node: Node,
  parent: Node | undefined,
  outer: readonly Node[],
  scope: Scope,
): boolean {
  if (parent === undefined || !isGlobalMember(ref)) {
    return false;
  }
  return (
    (parent.type === 'BinaryExpression' && comparisons.has(parent.operator)) ||
    (loops.has(parent.type) && 'test' in parent && parent.test === node) ||
    isBooleanCall(node, parent, scope) ||
    isConstValue(node, parent, outer)
  );
}
