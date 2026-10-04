import type { Node } from 'oxc-parser';

import { childNodes, strip } from '@/extract/ast.ts';

import { destructuredNames, requiredBy } from './cjs-forms.ts';
import type { Helpers, RequireUse } from './cjs-forms.ts';

/** A name that a `require` gives inside a function or a block: the module, or one export of it as `*`. */
export type NestedBinding = {
  found: RequireUse;
  local: string;
  imported: string;
  /** The `require` call is the whole value of the declarator, with no helper around it. */
  direct: boolean;
};

/** The names of `const x = require('s')` and `const { a } = require('s')`. */
function bindingsOf(declarator: Node, helpers: Helpers): NestedBinding[] {
  if (declarator.type !== 'VariableDeclarator' || declarator.init === null) {
    return [];
  }
  const found = requiredBy(declarator.init, helpers);
  if (found === undefined || found.member !== undefined) {
    return [];
  }
  const { id } = declarator;
  const direct = strip(declarator.init) === found.call;
  if (id.type === 'Identifier') {
    return [{ found, local: id.name, imported: '*', direct }];
  }
  const names = id.type === 'ObjectPattern' ? destructuredNames(id) : undefined;
  return (names ?? []).map(([local, imported]) => ({ found, local, imported, direct }));
}

/** The declarations of a `require` that are not at the top level of the module. */
function nestedBindings(body: readonly Node[], helpers: Helpers): NestedBinding[] {
  const found: NestedBinding[] = [];
  const visit = (node: Node): void => {
    found.push(...bindingsOf(node, helpers));
    for (const child of childNodes(node)) {
      visit(child);
    }
  };
  for (const statement of body) {
    // The declarators of a top-level declaration are read by the module reader itself.
    const inner =
      statement.type === 'VariableDeclaration'
        ? statement.declarations.flatMap(declarator => childNodes(declarator))
        : [statement];
    for (const node of inner) {
      visit(node);
    }
  }
  return found;
}

const keyOf = ({ found, imported }: NestedBinding): string => `${found.specifier}\0${imported}`;

/**
 * The nested requires whose name stands for one module and one export in the whole file. A name
 * that is declared for two modules, or that a top-level `require` already gives, stays unread: a
 * use of it cannot be told apart.
 */
export function readableNestedBindings(
  body: readonly Node[],
  helpers: Helpers,
  topLevel: ReadonlyMap<string, string>,
): NestedBinding[] {
  const all = nestedBindings(body, helpers);
  const keys = new Map<string, Set<string>>();
  for (const binding of all) {
    keys.set(binding.local, (keys.get(binding.local) ?? new Set<string>()).add(keyOf(binding)));
  }
  return all.filter(binding => {
    const top = topLevel.get(binding.local);
    return keys.get(binding.local)?.size === 1 && (top === undefined || top === keyOf(binding));
  });
}
