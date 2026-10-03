import type { Node } from 'oxc-parser';

import { childNodes, staticKey, staticString, strip, unwrap } from '@/extract/ast.ts';

/** The export names that a module asks of a file with `import()`, or `all` when it may use any. */
export type DynamicImports = Map<string, Set<string> | 'all'>;

/** The local names of `const { a, b: c = 1 } = …`, by the name they take, when every one is a plain name. */
export function destructuredImports(pattern: Node): Map<string, string> | undefined {
  if (pattern.type !== 'ObjectPattern') {
    return undefined;
  }
  const taken = new Map<string, string>();
  for (const property of pattern.properties) {
    if (property.type === 'RestElement') {
      return undefined;
    }
    const key = staticKey(property.key, property.computed);
    const value =
      property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
    if (key === undefined || value.type !== 'Identifier') {
      return undefined;
    }
    taken.set(value.name, key);
  }
  return taken;
}

/** The `import('literal')` that `const { a } = await import('literal')` holds, if the pattern is understood. */
export function destructuredImport(
  declarator: Node,
): { specifier: string; node: Node; names: Map<string, string> } | undefined {
  if (declarator.type !== 'VariableDeclarator' || declarator.init === null) {
    return undefined;
  }
  // Parentheses and casts around the `await` change nothing; `await` itself ends the search.
  let init: Node = declarator.init;
  for (
    let inner = unwrap(init);
    inner !== undefined && init.type !== 'AwaitExpression';
    inner = unwrap(init)
  ) {
    init = inner;
  }
  if (init.type !== 'AwaitExpression') {
    return undefined;
  }
  const call = strip(init.argument);
  const specifier = call.type === 'ImportExpression' ? staticString(call.source) : undefined;
  const names = destructuredImports(declarator.id);
  return specifier === undefined || names === undefined
    ? undefined
    : { specifier, node: call, names };
}

/**
 * What each file that a module imports with `import('literal')` is asked for. A result that is
 * destructured by name asks for those names. Any other use asks for all of the file.
 */
export function dynamicImportsOf(body: readonly Node[]): DynamicImports {
  const asked: DynamicImports = new Map();
  const understood = new Set<Node>();
  const loads: { specifier: string; node: Node }[] = [];
  const pending = [...body];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const found = destructuredImport(node);
    if (found !== undefined) {
      understood.add(found.node);
      const current = asked.get(found.specifier);
      if (current !== 'all') {
        asked.set(found.specifier, new Set([...(current ?? []), ...found.names.values()]));
      }
    }
    if (node.type === 'ImportExpression') {
      const specifier = staticString(node.source);
      if (specifier !== undefined) {
        loads.push({ specifier, node });
      }
    }
    pending.push(...childNodes(node));
  }
  for (const { specifier, node } of loads) {
    if (!understood.has(node)) {
      asked.set(specifier, 'all');
    }
  }
  return asked;
}
