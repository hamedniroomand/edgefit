import type { Node } from 'oxc-parser';

import { childNodes } from './ast.ts';
import type { NodeOf } from './ast.ts';

const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

export function patternNames(pattern: Node | null | undefined, names: string[] = []): string[] {
  if (pattern === null || pattern === undefined) {
    return names;
  }
  if (pattern.type === 'Identifier') {
    names.push(pattern.name);
  } else if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties) {
      patternNames(property.type === 'RestElement' ? property.argument : property.value, names);
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements) {
      patternNames(element, names);
    }
  } else if (pattern.type === 'RestElement') {
    patternNames(pattern.argument, names);
  } else if (pattern.type === 'AssignmentPattern') {
    patternNames(pattern.left, names);
  } else if (pattern.type === 'TSParameterProperty') {
    patternNames(pattern.parameter, names);
  }
  return names;
}

function isStatementLike(node: Node): boolean {
  return (
    node.type.endsWith('Statement') ||
    node.type.endsWith('Declaration') ||
    node.type === 'SwitchCase' ||
    node.type === 'CatchClause'
  );
}

/** `var` declarators hoisted to the enclosing function, without entering nested functions or classes. */
export function collectVarDeclarators(
  node: Node | null | undefined,
  declarators: NodeOf<'VariableDeclarator'>[] = [],
): NodeOf<'VariableDeclarator'>[] {
  if (node === null || node === undefined) {
    return declarators;
  }
  if (node.type === 'VariableDeclaration') {
    if (node.kind === 'var') {
      declarators.push(...node.declarations);
    }
    return declarators;
  }
  if (node.type === 'ExportNamedDeclaration') {
    return collectVarDeclarators(node.declaration, declarators);
  }
  if (functionTypes.has(node.type) || node.type.startsWith('Class') || !isStatementLike(node)) {
    return declarators;
  }
  for (const child of childNodes(node)) {
    collectVarDeclarators(child, declarators);
  }
  return declarators;
}

function declaredName(declaration: Node): string[] {
  if (declaration.type === 'VariableDeclaration') {
    return declaration.kind === 'var'
      ? []
      : declaration.declarations.flatMap(declarator => patternNames(declarator.id));
  }
  if (
    declaration.type === 'FunctionDeclaration' ||
    declaration.type === 'ClassDeclaration' ||
    declaration.type === 'TSEnumDeclaration' ||
    declaration.type === 'TSImportEqualsDeclaration'
  ) {
    return declaration.id === null ? [] : [declaration.id.name];
  }
  if (declaration.type === 'TSModuleDeclaration' && declaration.id.type === 'Identifier') {
    return [declaration.id.name];
  }
  return [];
}

/** Names declared with `let`, `const`, `class` or `function` directly in a block. */
export function collectLexicalNames(statements: readonly Node[], names: string[] = []): string[] {
  for (const statement of statements) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
        ? statement.declaration
        : statement;
    if (declaration !== null) {
      names.push(...declaredName(declaration));
    }
  }
  return names;
}

export function collectBlockNames(statements: readonly Node[]): string[] {
  const names = statements
    .flatMap(statement => collectVarDeclarators(statement))
    .flatMap(declarator => patternNames(declarator.id));
  return collectLexicalNames(statements, names);
}
