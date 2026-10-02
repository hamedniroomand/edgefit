import type { Node } from 'oxc-parser';

import type { ApiRef } from '@/types.ts';

import { isSymbolKey, staticKey, strip, unwrap } from './ast.ts';
import { memberRef } from './refs.ts';
import { lookupSymbol } from './scope.ts';
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
      /** The member access with the computed key, and what it sits in. */
      member: Node;
      memberParent: Node | undefined;
    };

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
      const key = staticKey(parent.property, parent.computed);
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
