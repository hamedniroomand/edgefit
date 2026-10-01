import { readFileSync } from 'node:fs';

import { parseSync } from 'oxc-parser';
import type { Node } from 'oxc-parser';

function stringValue(node: Node | null | undefined): string | undefined {
  return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
}

/** The `runtime` in `{ runtime: 'nodejs' }`, however the key is spelled. */
function runtimeOfObject(node: Node | null | undefined): string | undefined {
  if (node?.type !== 'ObjectExpression') {
    return undefined;
  }
  for (const property of node.properties) {
    if (property.type !== 'Property') {
      continue;
    }
    const key = property.key;
    const name =
      key.type === 'Identifier' ? key.name : key.type === 'Literal' ? String(key.value) : undefined;
    if (name === 'runtime') {
      return stringValue(property.value);
    }
  }
  return undefined;
}

/**
 * The runtime a Next.js route file picks for itself: `export const config = { runtime: 'nodejs' }`
 * or `export const runtime = 'nodejs'`. `undefined` when it picks none, or the file cannot be read.
 */
export function readRuntimeSetting(file: string): string | undefined {
  try {
    const { program } = parseSync(file, readFileSync(file, 'utf8'), {
      lang: /\.[cm]?ts$/u.test(file) ? 'ts' : 'js',
      sourceType: 'module',
    });
    for (const statement of program.body) {
      if (
        statement.type !== 'ExportNamedDeclaration' ||
        statement.declaration?.type !== 'VariableDeclaration'
      ) {
        continue;
      }
      for (const declarator of statement.declaration.declarations) {
        if (declarator.id.type !== 'Identifier') {
          continue;
        }
        if (declarator.id.name === 'runtime') {
          return stringValue(declarator.init);
        }
        if (declarator.id.name === 'config') {
          return runtimeOfObject(declarator.init);
        }
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}
