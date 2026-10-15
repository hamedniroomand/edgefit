import type { Node } from 'oxc-parser';

import { strip } from './ast.ts';

/**
 * Declarations that an exported value can have. A compiler removes a type or a `declare`. An enum
 * does not count, to stay on the safe side.
 */
const valueDeclarations = new Set([
  'VariableDeclaration',
  'FunctionDeclaration',
  'ClassDeclaration',
]);

/** A default export that can be a type, or that has no body. */
const notValues = new Set(['Identifier', 'TSInterfaceDeclaration', 'TSDeclareFunction']);

/**
 * Whether `statement` makes the file an ES module after a compiler removes the types. An import,
 * an export of names, and `export {}` can disappear, so they do not count.
 */
function keepsModule(statement: Node): boolean {
  if (statement.type === 'ExportDefaultDeclaration') {
    return !notValues.has(strip(statement.declaration).type);
  }
  if (statement.type === 'ExportAllDeclaration') {
    return statement.exportKind !== 'type';
  }
  // A JavaScript file has no `exportKind`, because it has no type exports.
  if (statement.type !== 'ExportNamedDeclaration' || statement.exportKind === 'type') {
    return false;
  }
  const { declaration } = statement;
  return (
    declaration !== null &&
    valueDeclarations.has(declaration.type) &&
    !('declare' in declaration && declaration.declare === true)
  );
}

/**
 * Whether the top-level `statements` of a file that surely is an ES module declare `name` with a
 * plain `let`. In a script, other scripts, an indirect `eval` and `new Function` can write a
 * top-level `let`, and a top-level `var` can be a property of the global object. A file that is not
 * surely a module keeps the alias. An exported name keeps its alias, to stay on the safe side.
 */
export function isModuleLet(statements: readonly Node[], name: string): boolean {
  return (
    statements.some(statement => keepsModule(statement)) &&
    statements.some(
      statement =>
        statement.type === 'VariableDeclaration' &&
        statement.kind === 'let' &&
        statement.declarations.some(
          declarator => declarator.id.type === 'Identifier' && declarator.id.name === name,
        ),
    )
  );
}
