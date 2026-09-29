import type { Category } from '@/types.ts';

/**
 * A node in a compatibility-matrix dump: a leaf holding the value's type (`function`,
 * `missing`, ...) or an object whose synthetic `*self*` key holds its own type.
 */
export type DumpNode = string | { [key: string]: DumpNode };

/** A whole dump, keyed by module name without the `node:` prefix, or `*globals*`. */
export type Dump = Record<string, DumpNode>;

export type Status = 'supported' | 'unsupported' | 'mocked' | 'mismatch' | 'uncovered';

export interface LookupResult {
  status: Status;
  note?: string;
  source?: string;
  /** Reported under this category instead of the one the status maps to. */
  category?: Category;
  /** The API is missing on the target, so a check for it fails. False for one that exists and throws. */
  absent?: true;
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

export function subtreeHasProblems(
  base: DumpNode | undefined,
  target: DumpNode | undefined,
): boolean {
  if (compare(base, target).status !== 'supported') {
    return true;
  }
  if (typeof base !== 'object') {
    return false;
  }
  return Object.entries(base).some(
    ([key, value]) => key !== '*self*' && subtreeHasProblems(value, child(target, key)),
  );
}
