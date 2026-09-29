import type { Node } from 'oxc-parser';

import type { VisitContext } from '@/extract/context.ts';

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
    context.visit(pattern.right);
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
