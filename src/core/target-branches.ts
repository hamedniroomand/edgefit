import { globalRef, normalizeRef } from '@/extract/refs.ts';
import type { Target } from '@/targets/index.ts';
import type { ApiRef, CheckCondition, Usage } from '@/types.ts';

/** Whether a load of the module that a `catch` stops fails on `target`, so the code after it does not run. */
export const isAfterMissingModule = (usage: Usage, target: Target): boolean =>
  usage.afterLoad === true &&
  usage.api !== undefined &&
  target.lookup({ module: usage.api.module, path: [] }).absent === true;

/**
 * Whether a call that must return before the usage runs always throws on `target`, so a `catch`
 * takes over and the code never runs: the API is missing, or throws whatever it is given.
 */
export function isAfterThrowingCall(usage: Usage, target: Target): boolean {
  return (
    usage.afterCalls?.some(ref => {
      const result = target.lookup(ref);
      return result.status === 'unsupported' && result.options === undefined;
    }) ?? false
  );
}

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

/** Whether the target already has `polyfill`, so a store that runs only when it is missing never runs. */
function hasPolyfilled(polyfill: ApiRef, target: Target): boolean {
  const name = polyfill.global === true ? polyfill.module : polyfill.path[0];
  return (
    name !== undefined && target.hasGlobal(name) && target.lookup(polyfill).status === 'supported'
  );
}

/**
 * Whether a usage is in the value of a store to a global that the target already has, so the
 * store never runs. With nested stores, the target having any one of them is enough.
 */
export const isShadowedPolyfill = (usage: Usage, target: Target): boolean =>
  usage.polyfills?.some(polyfill => hasPolyfilled(polyfill, target)) ?? false;

// Members that a runtime always sets when it has their object, and that are always truthy then.
const setWithObject = new Set(['process.versions', 'process.versions.node']);

/**
 * Whether the data decides that `ref` exists where it is supported. A member that the data does not
 * list takes the result of its object, which says nothing of the member (`process.versions.zzz`),
 * and the data does not say whether a value is truthy (`process.exitCode`). So only a module, a
 * global, and the members that are always set count.
 */
function decidesPresence(ref: ApiRef): boolean {
  return (
    ref.path.length === 0 ||
    (ref.module === '*globals*' && ref.path.length === 1) ||
    setWithObject.has([ref.module, ...ref.path].join('.'))
  );
}

/** Whether the target's data says `condition` holds there. A fact the data does not decide does not hold. */
function holds(condition: CheckCondition, target: Target): boolean {
  if (condition.kind === 'runtime') {
    return target.runtimes.includes(condition.runtime) === condition.present;
  }
  if (condition.kind === 'global') {
    return targetHas(target, condition.name) === condition.present;
  }
  const ref = normalizeRef(condition.ref);
  const result = target.lookup(ref);
  if (!condition.present) {
    return result.absent === true;
  }
  const global = ref.module === '*globals*' ? ref.path[0] : undefined;
  return (
    decidesPresence(ref) &&
    (global === undefined || target.hasGlobal(global)) &&
    result.absent !== true &&
    result.status !== 'unsupported' &&
    result.status !== 'uncovered'
  );
}

/**
 * Whether the usage sits in the `else` of a check that holds on the target, such as
 * `typeof process == 'object' && typeof process.versions.node == 'string'` on a target with
 * `process`, so the code never runs there.
 */
export const isFailedCheck = (usage: Usage, target: Target): boolean =>
  usage.failedChecks?.some(conditions => conditions.every(condition => holds(condition, target))) ??
  false;
