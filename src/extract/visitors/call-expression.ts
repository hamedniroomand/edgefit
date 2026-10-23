import type { NodeOf } from '@/extract/ast.ts';
import type { Visitor } from '@/extract/context.ts';

import { visitCall } from './calls.ts';
import { visitPageFunction } from './page-functions.ts';
import { visitSignalHandler } from './signals.ts';

/**
 * A call that sets or takes away a signal handler, or that sends a function to a browser page, is
 * visited as one, and any other call as a call.
 */
export const visitCallExpression: Visitor<NodeOf<'CallExpression'>> = (node, context) => {
  if (!visitSignalHandler(node, context) && !visitPageFunction(node, context)) {
    visitCall(node, context);
  }
};
