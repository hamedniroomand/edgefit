import { globalRef, normalizeRef } from '@/extract/refs.ts';
import type { Target } from '@/targets/index.ts';
import type { Usage } from '@/types.ts';

/** Whether a load of the module that a `catch` stops fails on `target`, so the code after it does not run. */
export const isAfterMissingModule = (usage: Usage, target: Target): boolean =>
  usage.afterLoad === true &&
  usage.api !== undefined &&
  target.lookup({ module: usage.api.module, path: [] }).absent === true;

/** Whether the runtime checks around a usage rule out the target's runtime, so the code never runs on it. */
export function isOtherRuntime(usage: Usage, target: Target): boolean {
  return (
    usage.runtimes?.some(({ runtime, present }) => target.runtimes.includes(runtime) !== present) ??
    false
  );
}

/**
 * Whether the target has the global: `false` when its data says the global is missing, `undefined`
 * when the data does not name it, so a check of it decides nothing.
 */
function targetHas(target: Target, name: string): boolean | undefined {
  // `globalThis.process` is the module `process`, which the target can lack while it names the global.
  const result = target.lookup(normalizeRef(globalRef(name)));
  if (result.absent === true) {
    return false;
  }
  return target.hasGlobal(name) && result.status !== 'uncovered' ? true : undefined;
}

/** Whether the global checks around a usage rule out what the target has, so the code never runs on it. */
export const isOtherGlobal = (usage: Usage, target: Target): boolean =>
  usage.globals?.some(({ name, present }) => targetHas(target, name) === !present) ?? false;

/** Whether a usage is in the value of a store to a global that the target already has, so the store never runs. */
export function isShadowedPolyfill(usage: Usage, target: Target): boolean {
  const { polyfill } = usage;
  const name = polyfill?.global === true ? polyfill.module : polyfill?.path[0];
  return (
    polyfill !== undefined &&
    name !== undefined &&
    target.hasGlobal(name) &&
    target.lookup(polyfill).status === 'supported'
  );
}
