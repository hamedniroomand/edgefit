import type { Node } from 'oxc-parser';

import { childNodes, strip } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { patternNames } from './declarations.ts';

const bindable = new Set(['Identifier', 'MemberExpression', 'CallExpression', 'ImportExpression']);

type Tally = { writes: number; declarations: number; value: Node | undefined };

function declaredNames(declaration: Node | null | undefined): string[] {
  return declaration?.type === 'VariableDeclaration'
    ? declaration.declarations.flatMap(declarator => patternNames(declarator.id))
    : [];
}

function nameOf(node: { id: { name: string } | null }): string[] {
  return node.id === null ? [] : [node.id.name];
}

const fallbackValues = new Set([
  'Literal',
  'ObjectExpression',
  'ArrayExpression',
  'TemplateLiteral',
]);

/** `name = value` with a literal, an object, an array or a template, which cannot be a module. */
function isFallback(node: NodeOf<'AssignmentExpression'>): boolean {
  return (
    node.operator === '=' &&
    node.left.type === 'Identifier' &&
    fallbackValues.has(strip(node.right).type)
  );
}

/** The names that `node` sets to a value. A declaration without a value sets nothing. */
function writtenNames(node: Node): string[] {
  if (node.type === 'AssignmentExpression') {
    // A fallback such as `x = {}` in a `catch` is a value that cannot be a module, as for a declaration.
    return isFallback(node) ? [] : patternNames(node.left);
  }
  if (node.type === 'UpdateExpression') {
    return patternNames(node.argument);
  }
  if (node.type === 'VariableDeclarator') {
    // A value that cannot be a module is replaced by the one that `=` sets. Any other value is a write.
    return node.init === null || !bindable.has(strip(node.init).type) ? [] : patternNames(node.id);
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
 * The value of each name that is declared once and set once with `=`, such as
 * `let c; c = require('fs')`. A declaration with a value that cannot be a module, such as `let c = null`,
 * is not counted as a write. The count is by name only. A name that two scopes share counts for
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
    if (
      node.type === 'AssignmentExpression' &&
      node.left.type === 'Identifier' &&
      !isFallback(node)
    ) {
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
