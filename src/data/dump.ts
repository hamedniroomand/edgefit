import type { Category, Suggestion } from '@/types.ts';

/**
 * A node in a compatibility-matrix dump: a leaf holding the value's type (`function`,
 * `missing`, ...) or an object whose synthetic `*self*` key holds its own type.
 */
export type DumpNode = string | { [key: string]: DumpNode };

/** A whole dump, keyed by module name without the `node:` prefix, or `*globals*`. */
export type Dump = Record<string, DumpNode>;

export type Status = 'supported' | 'unsupported' | 'mocked' | 'mismatch' | 'uncovered';

/** A compatibility flag of workerd that turns on by default from a compatibility date. */
export type FlagGate = {
  flag: string;
  /** With `nodejs_compat`, the flag turns on by default from this compatibility date. */
  date: string;
  /** The flag that turns it off. The default is the flag with `enable_` replaced by `disable_`. */
  disableFlag?: string;
};

/**
 * An option that makes a call fail: a key, or a key with the literal value that fails. A `gate`
 * says that the option fails only while that workerd flag is on.
 */
export type OptionMatch =
  | string
  | { key: string; value?: boolean | number | string; gate?: FlagGate };

export interface LookupResult {
  status: Status;
  note?: string;
  source?: string;
  /** Reported under this category instead of the one the status maps to. */
  category?: Category;
  /** The API is missing on the target, so a check for it fails. False for one that exists and throws. */
  absent?: true;
  /**
   * A finding only when the code reads the plain name, such as `document`, as the module loads.
   * Any other read of the plain name may sit behind a check that edgefit cannot read. A read
   * through `globalThis` is a finding wherever it is.
   */
  loadOnly?: 'bare';
  /** The options that make a call fail. A call that passes none of them is not a finding. */
  options?: readonly OptionMatch[];
  /** A change to a setting that makes the result go away. The caller adds the target. */
  suggestion?: Omit<Suggestion, 'target'>;
}

const functionLike = new Set(['function', 'class']);

// A Node API with one of these baseline types is deprecated, experimental or version-specific.
const unstableTypes = new Set(['missing', 'undefined', 'null', '<INSPECTION ERROR>']);

export function typeOf(node: DumpNode | undefined): string {
  if (node === undefined) {
    return 'missing';
  }
  if (typeof node === 'string') {
    return node;
  }
  const self = node['*self*'];
  return typeof self === 'string' ? self : 'object';
}

export function child(node: DumpNode | undefined, key: string): DumpNode | undefined {
  if (node === undefined || typeof node === 'string' || !Object.hasOwn(node, key)) {
    return undefined;
  }
  return node[key];
}

export function compare(base: DumpNode | undefined, target: DumpNode | undefined): LookupResult {
  const baseType = typeOf(base);
  const targetType = typeOf(target);
  if (unstableTypes.has(baseType) || targetType === '<INSPECTION ERROR>') {
    return { status: 'supported' };
  }
  if (targetType === 'missing') {
    return { status: 'unsupported', note: 'does not exist on the target', absent: true };
  }
  const sameKind =
    baseType === targetType || (functionLike.has(baseType) && functionLike.has(targetType));
  return sameKind
    ? { status: 'supported' }
    : { status: 'mismatch', note: `is a ${targetType} on the target but a ${baseType} in Node` };
}

/** Whether the tree has a problem at or below `base`. It skips each path below for which `curated` is true. */
export function subtreeHasProblems(
  base: DumpNode | undefined,
  target: DumpNode | undefined,
  curated: (path: readonly string[]) => boolean,
  path: readonly string[] = [],
): boolean {
  if (compare(base, target).status !== 'supported') {
    return true;
  }
  if (typeof base !== 'object') {
    return false;
  }
  return Object.entries(base).some(([key, value]) => {
    const below = [...path, key];
    return (
      key !== '*self*' &&
      !curated(below) &&
      subtreeHasProblems(value, child(target, key), curated, below)
    );
  });
}
