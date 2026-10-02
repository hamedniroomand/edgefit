import type { LookupResult, Status } from '@/data/dump.ts';
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

function classifyApi(usage: Usage, target: Target): Classification | undefined {
  if (usage.api === undefined) {
    return undefined;
  }
  const result = target.lookup(usage.api);
  const statusCategory = categoryByStatus[result.status];
  if (statusCategory === undefined) {
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
  if (usage.api !== undefined) {
    const covered = target.lookup(usage.api).status !== 'supported';
    if (covered || !target.hasProblemsBelow(usage.api)) {
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
