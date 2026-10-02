import type { Node } from 'oxc-parser';

import { childNodes } from './ast.ts';
import { patternNames } from './declarations.ts';

type Tally = { writes: number; declarations: number; value: Node | undefined };

function declaredNames(declaration: Node | null | undefined): string[] {
  return declaration?.type === 'VariableDeclaration'
    ? declaration.declarations.flatMap(declarator => patternNames(declarator.id))
    : [];
}

function nameOf(node: { id: { name: string } | null }): string[] {
  return node.id === null ? [] : [node.id.name];
}

/** The names that `node` sets to a value. A declaration without a value sets nothing. */
function writtenNames(node: Node): string[] {
  if (node.type === 'AssignmentExpression') {
    return patternNames(node.left);
  }
  if (node.type === 'UpdateExpression') {
    return patternNames(node.argument);
  }
  if (node.type === 'VariableDeclarator') {
    return node.init === null ? [] : patternNames(node.id);
  }
  if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
    return [...declaredNames(node.left), ...patternNames(node.left)];
  }
  if (node.type === 'ExportNamedDeclaration') {
    const listed = node.specifiers.flatMap(specifier => patternNames(specifier.local));
    return [...declaredNames(node.declaration), ...listed];
  }
  if (node.type === 'CatchClause') {
    return patternNames(node.param);
  }
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
    return nameOf(node);
  }
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
    return [...nameOf(node), ...node.params.flatMap(param => patternNames(param))];
  }
  if (node.type === 'ArrowFunctionExpression') {
    return node.params.flatMap(param => patternNames(param));
  }
  return [];
}

/**
 * The value of each name that is declared once without a value and set once with `=`, such as
 * `let c; c = require('fs')`. The count is by name only. A name that two scopes share counts for
 * both, so a name in the result has no other declaration or write in the file. An export counts
 * as a write, because other code can read the name.
 */
export function findAssigned(body: readonly Node[]): Map<string, Node> {
  const tallies = new Map<string, Tally>();
  const tally = (name: string): Tally => {
    const found = tallies.get(name) ?? { writes: 0, declarations: 0, value: undefined };
    tallies.set(name, found);
    return found;
  };
  const pending = [...body];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    for (const name of writtenNames(node)) {
      tally(name).writes += 1;
    }
    if (node.type === 'VariableDeclarator') {
      for (const name of patternNames(node.id)) {
        tally(name).declarations += 1;
      }
    }
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') {
      tally(node.left.name).value = node.operator === '=' ? node.right : undefined;
    }
    for (const child of childNodes(node)) {
      pending.push(child);
    }
  }
  const assigned = new Map<string, Node>();
  for (const [name, { writes, declarations, value }] of tallies) {
    if (writes === 1 && declarations === 1 && value !== undefined) {
      assigned.set(name, value);
    }
  }
  return assigned;
}
