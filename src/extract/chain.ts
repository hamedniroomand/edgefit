import type { Node } from 'oxc-parser';

import type { ApiRef } from '@/types.ts';

import { isSymbolKey, staticKey, strip, unwrap } from './ast.ts';
import { memberRef } from './refs.ts';
import { lookupKeys, lookupSymbol } from './scope.ts';
import type { Scope } from './scope.ts';

const invokers = new Set(['apply', 'bind', 'call']);

export type ChainResult =
  | {
      kind: 'static';
      ref: ApiRef;
      offset: number;
      extended: boolean;
      node: Node;
      parent: Node | undefined;
    }
  | {
      kind: 'computed';
      ref: ApiRef;
      offset: number;
      propertyOffset: number;
      /** The strings the key may be, when it is a name that holds one of a known set. */
      keys: readonly string[] | undefined;
      /** The member access with the computed key, and what it sits in. */
      member: Node;
      memberParent: Node | undefined;
    };

/** The strings that the computed key of `access` may be, when it is a `const` that holds one of a known set. */
function knownKeys(access: Node, scope: Scope): readonly string[] | undefined {
  const property =
    access.type === 'MemberExpression' && access.computed ? strip(access.property) : undefined;
  return property?.type === 'Identifier' ? lookupKeys(scope, property.name) : undefined;
}

function isSymbol(key: Node, scope: Scope): boolean {
  const inner = strip(key);
  return isSymbolKey(inner) || (inner.type === 'Identifier' && lookupSymbol(scope, inner.name));
}

/**
 * Follows the reference at the top of the ancestor stack up through member accesses
 * and value-preserving wrappers, so `(await import('fs')).promises.watch` yields
 * `fs.promises.watch`. Stops at the first computed key it cannot read statically.
 */
export function followChain(
  stack: readonly Node[],
  ref: ApiRef,
  offset: number,
  scope: Scope,
): ChainResult {
  let position = stack.length - 1;
  let node = stack[position];
  let current = { ref, offset, extended: false };
  let parent = stack[position - 1];
  while (node !== undefined && parent !== undefined) {
    if (parent.type === 'MemberExpression' && parent.object === node) {
      const names = knownKeys(parent, scope);
      // A name that holds one string is that string.
      const key =
        staticKey(parent.property, parent.computed) ?? (names?.length === 1 ? names[0] : undefined);
      if (key !== undefined && current.ref.path.length > 0 && invokers.has(key)) {
        // `fn.call(...)` uses `fn` itself; `call` is not part of the API.
        break;
      }
      if (key === undefined && parent.computed && isSymbol(parent.property, scope)) {
        // A symbol is never an API name, so the chain ends here without being unknown.
        break;
      }
      if (key === undefined) {
        return {
          kind: 'computed',
          ...current,
          propertyOffset: parent.property.start,
          keys: names,
          member: parent,
          memberParent: stack[position - 2],
        };
      }
      current = { ref: memberRef(current.ref, key), offset: parent.property.start, extended: true };
    } else if (unwrap(parent) !== node) {
      break;
    }
    node = parent;
    position -= 1;
    parent = stack[position - 1];
  }
  if (node === undefined) {
    throw new Error('followChain needs the reference on the ancestor stack');
  }
  return { kind: 'static', ...current, node, parent };
}
