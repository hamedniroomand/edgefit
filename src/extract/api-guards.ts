import type { Node } from 'oxc-parser';

import { rootName } from './ast.ts';
import { resolveBinding } from './bindings.ts';
import type { BindingContext } from './bindings.ts';
import type { AbsentGuard, ApiGuard } from './guard-stack.ts';
import { memberRef, normalizeRef } from './refs.ts';
import { isTracked, lookup } from './scope.ts';

/** The guard that says `node`, or its member `key`, exists. */
export function guardFor(node: Node, context: BindingContext, key?: string): ApiGuard[] {
  const binding = resolveBinding(node, context);
  if (!isTracked(binding)) {
    return [];
  }
  const name = rootName(node);
  const ref = normalizeRef(key === undefined ? binding.ref : memberRef(binding.ref, key));
  const local = name !== undefined && lookup(context.scope, name) !== undefined;
  return [{ kind: 'api', ref, root: local ? name : undefined, active: true }];
}

/** The guard that says `node`, or its member `key`, is missing. */
export function absentGuard(node: Node, context: BindingContext, key?: string): AbsentGuard[] {
  const binding = resolveBinding(node, context);
  if (!isTracked(binding)) {
    return [];
  }
  return [
    {
      kind: 'absent',
      ref: normalizeRef(key === undefined ? binding.ref : memberRef(binding.ref, key)),
    },
  ];
}
