import type { Node } from 'oxc-parser';

import { isFunction, staticKey, strip } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import type { VisitContext } from '@/extract/context.ts';
import type { Guard } from '@/extract/guard-stack.ts';

const pageMethods = new Set(['evaluate', 'evaluateHandle', 'evaluateOnNewDocument']);

/** A browser page runs the code, so none of the runtimes that call it does. */
const noRuntime: readonly Guard[] = (
  ['workerd', 'bun', 'deno', 'netlify', 'vercel-edge'] as const
).map(runtime => ({ kind: 'runtime', condition: { runtime, present: false } }));

/**
 * The function that a call such as `page.evaluate(fn, ...args)` sends to a browser page: a function
 * written as the first argument of a method with the name `evaluate`, `evaluateHandle` or
 * `evaluateOnNewDocument`. A function that the call names, and an optional call, are not one.
 */
function pageFunction(node: NodeOf<'CallExpression'>): Node | undefined {
  const callee = strip(node.callee);
  const [first] = node.arguments;
  if (node.optional || callee.type !== 'MemberExpression' || first === undefined) {
    return undefined;
  }
  const method = staticKey(callee.property, callee.computed);
  if (method === undefined || !pageMethods.has(method)) {
    return undefined;
  }
  return isFunction(strip(first)) ? first : undefined;
}

/**
 * The code of a page function runs in the browser page, never on the runtime that makes the call.
 * So the usages in it are guarded on every runtime. The callee and the other arguments are code of
 * the caller.
 */
export function visitPageFunction(node: NodeOf<'CallExpression'>, context: VisitContext): boolean {
  const page = pageFunction(node);
  if (page === undefined) {
    return false;
  }
  context.visit(node.callee);
  for (const argument of node.arguments) {
    if (argument === page) {
      context.collector.guards.within(noRuntime, () => {
        context.visit(argument);
      });
    } else {
      context.visit(argument);
    }
  }
  return true;
}
