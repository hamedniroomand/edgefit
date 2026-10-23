import type { Node } from 'oxc-parser';

import { memberPath } from '@/data/compat-index.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { resolveBinding } from '@/extract/bindings.ts';
import type { VisitContext } from '@/extract/context.ts';
import { displayRef, extendedReason, memberRef } from '@/extract/refs.ts';
import { isTracked } from '@/extract/scope.ts';

/**
 * Visits the parent of `class X extends parent` or `util.inherits(X, parent)`. A class that
 * inherits from a Node.js class uses the class and its instance members, not the whole module.
 * The instance members are the ones under `prototype`, so only a missing one is reported.
 * ponytail: a static member that the subclass inherits, such as `X.init()`, is not credited.
 * The data records which static members a target lacks, so a class that never calls one is safe.
 */
export function visitParentClass(parent: Node, context: VisitContext): void {
  const binding = resolveBinding(parent, context);
  if (!isTracked(binding) || binding.ref.module === '*globals*') {
    context.visit(parent);
    return;
  }
  context.visitBound(parent);
  context.collector.dynamic(
    memberRef(binding.ref, 'prototype'),
    displayRef(binding.ref),
    extendedReason,
    parent.start,
  );
}

/** `util.inherits(Child, Parent)` makes `Parent` the parent class of `Child`. */
export function visitInherits(node: NodeOf<'CallExpression'>, context: VisitContext): boolean {
  const callee = resolveBinding(node.callee, context);
  const [child, parent, ...rest] = node.arguments;
  if (
    !isTracked(callee) ||
    callee.ref.module !== 'util' ||
    memberPath(callee.ref).join('.') !== 'inherits' ||
    child === undefined ||
    parent === undefined ||
    parent.type === 'SpreadElement'
  ) {
    return false;
  }
  context.visit(node.callee);
  context.visitAll([child]);
  visitParentClass(parent, context);
  context.visitAll(rest);
  return true;
}
