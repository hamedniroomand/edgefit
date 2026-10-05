import type { Node } from 'oxc-parser';

import { childNodes, isFunction } from './ast.ts';
import { collectBlockNames, collectLexicalNames, patternNames } from './declarations.ts';

type Pending = { node: Node; hidden: ReadonlySet<string> };

const found = new WeakMap<readonly Node[], ReadonlySet<string>>();

function headNames(head: Node | null, lexical: boolean): string[] {
  return head?.type === 'VariableDeclaration' && (head.kind !== 'var') === lexical
    ? head.declarations.flatMap(declarator => patternNames(declarator.id))
    : [];
}

/** The names that `node` sets to a value: a declaration with a value, `=`, `++`, or a loop target. */
function setNames(node: Node): string[] {
  if (node.type === 'VariableDeclarator') {
    return node.init === null ? [] : patternNames(node.id);
  }
  if (node.type === 'AssignmentExpression') {
    return patternNames(node.left);
  }
  if (node.type === 'UpdateExpression') {
    return patternNames(node.argument);
  }
  if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
    return node.left.type === 'VariableDeclaration'
      ? headNames(node.left, false)
      : patternNames(node.left);
  }
  return [];
}

/** The names that a nested function, block, loop or `catch` declares for itself. */
function ownNames(node: Node): string[] {
  if (isFunction(node)) {
    const names = node.params.flatMap(param => patternNames(param));
    if (node.type === 'FunctionExpression' && node.id !== null) {
      names.push(node.id.name);
    }
    return node.body?.type === 'BlockStatement'
      ? [...names, ...collectBlockNames(node.body.body)]
      : names;
  }
  if (node.type === 'BlockStatement' || node.type === 'StaticBlock') {
    return collectLexicalNames(node.body);
  }
  if (node.type === 'SwitchStatement') {
    return node.cases.flatMap(switchCase => collectLexicalNames(switchCase.consequent));
  }
  if (node.type === 'CatchClause') {
    return patternNames(node.param);
  }
  if (node.type === 'ForStatement') {
    return headNames(node.init, true);
  }
  if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
    return headNames(node.left, true);
  }
  return [];
}

/**
 * The names that `statements` set to a value more than once. The value of a `let` or `var` counts
 * as one. A write inside a nested function or block that declares the name itself is to another
 * variable, so it does not count.
 * ponytail: a block is scanned the first time one of its checks is read, so a nested block can be
 * scanned once for each block around it. Upgrade: count the writes of every scope in one pass.
 */
export function namesSetAgain(statements: readonly Node[]): ReadonlySet<string> {
  const cached = found.get(statements);
  if (cached !== undefined) {
    return cached;
  }
  const counts = new Map<string, number>();
  const pending: Pending[] = statements.map(node => ({ node, hidden: new Set<string>() }));
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    const own = ownNames(item.node);
    const hidden = own.length === 0 ? item.hidden : new Set([...item.hidden, ...own]);
    for (const name of setNames(item.node)) {
      if (!hidden.has(name)) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    for (const child of childNodes(item.node)) {
      pending.push({ node: child, hidden });
    }
  }
  const again = new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  found.set(statements, again);
  return again;
}
