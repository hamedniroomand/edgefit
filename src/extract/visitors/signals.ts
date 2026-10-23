import type { Node } from 'oxc-parser';

import { memberPath } from '@/data/compat-index.ts';
import { isFunction, strip } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { foldedString, resolveBinding } from '@/extract/bindings.ts';
import type { VisitContext } from '@/extract/context.ts';
import type { Guard } from '@/extract/guard-stack.ts';
import { isSettled } from '@/extract/known-values.ts';
import { normalizeRef } from '@/extract/refs.ts';
import { isTracked, lookupKeys } from '@/extract/scope.ts';

const addMethods = new Set(['on', 'once', 'addListener']);
const removeMethods = new Set(['off', 'removeListener']);

/**
 * The runtimes where the code of a handler does not run: workerd, where a real signal does not
 * call a handler, and Vercel Edge, which has only `process.env`. Netlify Edge Functions run Deno,
 * which calls a handler when a signal arrives.
 */
const noSignalRuntimes: readonly Guard[] = (['workerd', 'vercel-edge'] as const).map(runtime => ({
  kind: 'runtime',
  condition: { runtime, present: false },
}));

/** The method of `process` that a call uses, such as `on`. */
function processMethod(node: NodeOf<'CallExpression'>, context: VisitContext): string | undefined {
  const callee = resolveBinding(node.callee, context);
  if (!isTracked(callee)) {
    return undefined;
  }
  const ref = normalizeRef(callee.ref);
  return ref.module === 'process' ? memberPath(ref).join('.') : undefined;
}

/**
 * Whether the event is a signal, and no code can change that. The event is a string, a `const`
 * string, or the loop variable of an array that the code writes in place. A list that has a name
 * can get a string that is not a signal later, as `names.push('exit')` does, so it does not count.
 */
function namesSignals(event: Node, context: VisitContext): boolean {
  const { scope } = context;
  const text = foldedString(event, scope);
  if (text !== undefined) {
    return text.startsWith('SIG');
  }
  const inner = strip(event);
  const keys = inner.type === 'Identifier' ? lookupKeys(scope, inner.name) : undefined;
  return isSettled(keys) && keys?.every(name => name.startsWith('SIG')) === true;
}

/**
 * The function that a call of `process` sets as the handler of a signal, such as
 * `process.on('SIGTERM', handler)`, or takes away from `process`. A call as the handler runs now,
 * so it is not one.
 */
function signalHandler(node: NodeOf<'CallExpression'>, context: VisitContext): Node | undefined {
  const [event, handler] = node.arguments;
  // A call such as `process.on?.()` is read by the check of its optional callee.
  if (node.optional || event === undefined || handler === undefined) {
    return undefined;
  }
  const value = strip(handler);
  if (!isFunction(value) && value.type !== 'Identifier') {
    return undefined;
  }
  const method = processMethod(node, context);
  if (method === undefined) {
    return undefined;
  }
  const isSignal = addMethods.has(method)
    ? namesSignals(event, context)
    : removeMethods.has(method);
  return isSignal ? handler : undefined;
}

/**
 * The code of a signal handler runs only where a signal arrives. So the usages in it are guarded
 * on the runtimes without signals. A function that the code only hands to `process` as a handler,
 * or takes away from it, gets the same guards.
 */
export function visitSignalHandler(node: NodeOf<'CallExpression'>, context: VisitContext): boolean {
  const handler = signalHandler(node, context);
  if (handler === undefined) {
    return false;
  }
  context.visit(node.callee);
  for (const argument of node.arguments) {
    if (argument === handler) {
      context.collector.guards.within(noSignalRuntimes, () => {
        context.visit(argument);
      });
    } else {
      context.visit(argument);
    }
  }
  return true;
}
