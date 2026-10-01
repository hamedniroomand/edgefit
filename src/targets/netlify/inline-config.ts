import { readFileSync } from 'node:fs';

import { parseSync } from 'oxc-parser';
import type { Node } from 'oxc-parser';

function keyName(node: Node): string | undefined {
  if (node.type === 'Identifier') {
    return node.name;
  }
  return node.type === 'Literal' ? String(node.value) : undefined;
}

function unwrap(node: Node | null | undefined): Node | null | undefined {
  return node?.type === 'TSSatisfiesExpression' || node?.type === 'TSAsExpression'
    ? unwrap(node.expression)
    : node;
}

/**
 * Whether a function routes itself: `export const config = { path: '/x' }`, or `pattern`.
 * Netlify reads this instead of a `[[edge_functions]]` table.
 */
export function hasInlineRoute(file: string): boolean {
  const { program } = parseSync(file, readFileSync(file, 'utf8'), {
    lang: /\.[cm]?tsx?$/u.test(file) ? 'ts' : 'js',
    sourceType: 'module',
  });
  return program.body.some(statement => {
    if (
      statement.type !== 'ExportNamedDeclaration' ||
      statement.declaration?.type !== 'VariableDeclaration'
    ) {
      return false;
    }
    return statement.declaration.declarations.some(declarator => {
      const init = unwrap(declarator.init);
      return (
        declarator.id.type === 'Identifier' &&
        declarator.id.name === 'config' &&
        init?.type === 'ObjectExpression' &&
        init.properties.some(
          property =>
            property.type === 'Property' &&
            ['path', 'pattern'].includes(keyName(property.key) ?? ''),
        )
      );
    });
  });
}
