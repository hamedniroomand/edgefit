import type { Node } from 'oxc-parser';

import { childNodes, isTypeOnly } from './ast.ts';

function collectValueNames(node: Node, names: Set<string>): void {
  if (isTypeOnly(node) || ('exportKind' in node && node.exportKind === 'type')) {
    return;
  }
  if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
    names.add(node.name);
  }
  for (const child of childNodes(node)) {
    collectValueNames(child, names);
  }
}

/**
 * The imported names that nothing reads as a value. A bundler drops them, so they use no API.
 * A name that is read in any scope counts as read: that keeps an import and never drops one.
 */
export function typeOnlyImports(body: readonly Node[]): Set<string> {
  const imported = new Set<string>();
  const used = new Set<string>();
  for (const statement of body) {
    if (statement.type !== 'ImportDeclaration') {
      collectValueNames(statement, used);
    } else if (statement.importKind !== 'type') {
      for (const specifier of statement.specifiers) {
        if (specifier.type !== 'ImportSpecifier' || specifier.importKind !== 'type') {
          imported.add(specifier.local.name);
        }
      }
    }
  }
  return new Set([...imported].filter(name => !used.has(name)));
}
