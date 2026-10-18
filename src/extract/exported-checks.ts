import type { BindingContext } from './bindings.ts';
import { heldCheck } from './checks.ts';
import type { Guard, HeldGuards } from './guard-stack.ts';
import { guardsWhen } from './guards.ts';

/**
 * A guard that means the same in a file that imports the check. A local name of this file, as the
 * root or the key of an API guard, names nothing there, and `require.main` is about this file.
 * Option and polyfill guards are not kept: they are about a function or a store of this file.
 */
function portable(guard: Guard): Guard[] {
  if (guard.kind === 'api') {
    return guard.key === undefined ? [{ ...guard, root: undefined }] : [];
  }
  if (guard.kind === 'dead') {
    return guard.main === true ? [] : [guard];
  }
  return guard.kind === 'runtime' || guard.kind === 'global' || guard.kind === 'absent'
    ? [guard]
    : [];
}

/** What a `const` that this file exports as `name` tells a file that imports it. */
export function exportedCheck(name: string, context: BindingContext): HeldGuards | undefined {
  const check = heldCheck(context.scope, name);
  if (
    check === undefined ||
    check.call ||
    check.region !== undefined ||
    check.held !== undefined ||
    check.busy
  ) {
    return undefined;
  }
  const scoped = {
    imported: context.imported,
    scope: check.scope,
    globals: context.globals,
    nodeEnv: context.nodeEnv,
    wrappers: context.wrappers,
  };
  const whenTrue = guardsWhen(check.test, !check.negated, scoped).flatMap(guard => portable(guard));
  const whenFalse = guardsWhen(check.test, check.negated, scoped).flatMap(guard => portable(guard));
  return whenTrue.length === 0 && whenFalse.length === 0 ? undefined : { whenTrue, whenFalse };
}
