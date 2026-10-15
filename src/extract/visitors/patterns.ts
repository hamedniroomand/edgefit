import type { Node } from 'oxc-parser';

import type { NodeOf } from '@/extract/ast.ts';
import type { VisitContext } from '@/extract/context.ts';

/**
 * Visits the default value of `left = right`. The default of an object or array pattern is
 * destructured. `isOptionalRead` needs the pattern as its parent to see that.
 */
export function visitDefault(pattern: NodeOf<'AssignmentPattern'>, context: VisitContext): void {
  if (pattern.left.type === 'ObjectPattern' || pattern.left.type === 'ArrayPattern') {
    context.withAncestor(pattern, () => {
      context.visit(pattern.right);
    });
  } else {
    context.visit(pattern.right);
  }
}

/** Visits the runtime parts of a binding pattern: default values and computed keys. */
export function visitPattern(pattern: Node | null | undefined, context: VisitContext): void {
  if (pattern === null || pattern === undefined) {
    return;
  }
  if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties) {
      if (property.type === 'RestElement') {
        visitPattern(property.argument, context);
      } else {
        context.visit(property.computed ? property.key : null);
        visitPattern(property.value, context);
      }
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements) {
      visitPattern(element, context);
    }
  } else if (pattern.type === 'RestElement') {
    visitPattern(pattern.argument, context);
  } else if (pattern.type === 'AssignmentPattern') {
    visitPattern(pattern.left, context);
    visitDefault(pattern, context);
  } else if (pattern.type === 'TSParameterProperty') {
    context.visitAll(pattern.decorators);
    visitPattern(pattern.parameter, context);
  } else if (pattern.type === 'Identifier') {
    context.visitAll(pattern.decorators ?? []);
  } else {
    // Member expressions can be assignment targets, e.g. `for (obj.key of list)`.
    context.visit(pattern);
  }
}
