import type { Node } from 'oxc-parser';

import { resolveBinding } from '@/extract/bindings.ts';
import type { VisitContext } from '@/extract/context.ts';
import { displayRef, memberRef } from '@/extract/refs.ts';
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
    'extended by a class, so its instance members may be used elsewhere',
    parent.start,
  );
}
