import { isSyntheticLeaf } from '@/data/builtins.ts';
import type { LookupResult, OptionMatch, Status } from '@/data/dump.ts';
import type { Target } from '@/targets/index.ts';
import type { Category, Suggestion, Usage } from '@/types.ts';

export interface Classification {
  category: Category;
  detail: string;
  source: string | undefined;
  /** The target lacks the API, so code that checks for it first never reaches it. */
  absent: boolean;
  /** A change to a setting that makes this go away. The target is not added yet. */
  suggestion?: Omit<Suggestion, 'target'>;
}

const categoryByStatus: Partial<Record<Status, Category>> = {
  unsupported: 'unsupported',
  mocked: 'mocked',
  mismatch: 'mismatch',
  uncovered: 'unknown',
};

function describe(result: LookupResult): string {
  if (result.status === 'uncovered') {
    return 'is not covered by the compatibility data';
  }
  return result.note ?? `is ${result.status} on the target`;
}

/** Whether the call passes an option that fails: the key, and the value when the option names one. */
function passesOption(usage: Usage, options: readonly OptionMatch[]): boolean {
  return options.some(option =>
    (usage.passedKeys ?? []).some(passed =>
      typeof option === 'string'
        ? passed.key === option
        : passed.key === option.key &&
          (option.value === undefined || passed.value === option.value),
    ),
  );
}

/** A usage that only counts for options, on an API without them, or a call that passes none that fail. */
function isOptionMiss(usage: Usage, result: LookupResult): boolean {
  return result.options === undefined
    ? usage.onlyForOptions === true
    : !passesOption(usage, result.options);
}

/**
 * Whether a usage says nothing about support: a call that only counts for options, or an API
 * that fails only for some options, so a call that passes none of them is not a proof. A read of a
 * plain global name that only counts at load says nothing when it does not run at load.
 */
export function dependsOnOptions(usage: Usage, target: Target): boolean {
  if (usage.api === undefined) {
    return usage.onlyForOptions === true;
  }
  const result = target.lookup(usage.api);
  return usage.onlyForOptions === true || result.options !== undefined || isLazyRead(usage, result);
}

/**
 * A read of a plain global name that the target lacks, in code that does not run as the module
 * loads, when the data says that only a read at load is a finding. Such a read often sits behind
 * an environment check that edgefit cannot read: the module loads, and the read runs only on a
 * runtime that has the global.
 */
function isLazyRead(usage: Usage, result: LookupResult): boolean {
  return result.loadOnly === 'bare' && usage.bare === true && usage.atLoad !== true;
}

function classifyApi(usage: Usage, target: Target): Classification | undefined {
  if (usage.api === undefined) {
    return undefined;
  }
  const result = target.lookup(usage.api);
  const statusCategory = categoryByStatus[result.status];
  if (statusCategory === undefined || isOptionMiss(usage, result) || isLazyRead(usage, result)) {
    return undefined;
  }
  const category = result.category ?? statusCategory;
  return {
    category,
    detail: describe(result),
    source: result.source,
    absent: result.absent === true,
    ...(result.suggestion === undefined ? {} : { suggestion: result.suggestion }),
  };
}

/**
 * A dynamic access is only worth reporting when it could reach something unsupported,
 * and only once: if the API it starts from is itself unsupported, that finding covers it.
 */
function classifyDynamic(usage: Usage, target: Target): Classification | undefined {
  const reason = usage.reason ?? 'it cannot be analyzed statically';
  // An export adds no way to reach a global that any code does not already have. The use site is checked.
  if (
    usage.exported === true &&
    usage.api?.module === '*globals*' &&
    target.lookup(usage.api).status === 'supported'
  ) {
    return undefined;
  }
  if (usage.api !== undefined) {
    const result = target.lookup(usage.api);
    // A leaf such as `(dynamic)` names this very usage, so no other finding covers it.
    const own = isSyntheticLeaf(usage.api.path);
    if (own && result.status !== 'supported') {
      return classifyApi(usage, target);
    }
    // An API that fails only for some options has a finding only for a call that passes one.
    const covered = result.status !== 'supported' && result.options === undefined;
    if (!own && (covered || !target.hasProblemsBelow(usage.api))) {
      return undefined;
    }
  }
  return {
    category: 'unknown',
    detail: `cannot be checked statically: ${reason}`,
    source: undefined,
    absent: false,
  };
}

export function classify(usage: Usage, target: Target): Classification | undefined {
  switch (usage.kind) {
    case 'api': {
      return classifyApi(usage, target);
    }
    case 'dynamic': {
      return classifyDynamic(usage, target);
    }
    case 'mocked': {
      return {
        category: 'mocked',
        detail: usage.reason ?? 'is mocked',
        source: undefined,
        absent: false,
      };
    }
    case 'native': {
      return target.loadsNativeAddons === true
        ? undefined
        : {
            category: 'unsupported',
            detail: 'is a native addon, which this target cannot load',
            source: undefined,
            absent: true,
          };
    }
    default: {
      throw new Error(`Unknown usage kind: ${String(usage.kind)}`);
    }
  }
}
