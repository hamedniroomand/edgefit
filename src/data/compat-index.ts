import type { ApiRef } from '@/types.ts';

import { child, compare, subtreeHasProblems } from './dump.ts';
import type { Dump, LookupResult } from './dump.ts';
import type { CompatEntry, CompatTree } from './providers/provider.ts';

function entryKey(module: string, path: readonly string[]): string {
  return [module, ...path].join('.');
}

/** A default import of a built-in is the module itself, so `fs.default.watch` is `fs.watch`. */
function memberPath(api: ApiRef): string[] {
  return api.module !== '*globals*' && api.path[0] === 'default' ? api.path.slice(1) : api.path;
}

function toResult(entry: CompatEntry): LookupResult {
  return {
    status: entry.status,
    note: entry.note,
    source: entry.source.url,
    category: entry.category,
  };
}

function entryMap(entries: readonly CompatEntry[]): Map<string, CompatEntry> {
  return new Map(entries.map(entry => [entryKey(entry.module, entry.path), entry]));
}

/** The entry for the API or its closest ancestor. */
function findEntry(
  entries: ReadonlyMap<string, CompatEntry>,
  module: string,
  path: readonly string[],
): CompatEntry | undefined {
  for (let length = path.length; length >= 0; length -= 1) {
    const entry = entries.get(entryKey(module, path.slice(0, length)));
    if (entry !== undefined) {
      return entry;
    }
  }
  return undefined;
}

function inDump(dump: Dump, module: string, path: readonly string[]): boolean {
  let node = Object.hasOwn(dump, module) ? dump[module] : undefined;
  for (const segment of path) {
    node = child(node, segment);
  }
  return node !== undefined;
}

function isBelow(entry: CompatEntry, module: string, path: readonly string[]): boolean {
  return (
    entry.module === module &&
    entry.path.length > path.length &&
    path.every((segment, index) => entry.path[index] === segment)
  );
}

/**
 * Compatibility of one target: curated entries first, then the tree, then fallback entries for
 * APIs the tree does not describe. An entry applies to its API and everything below it, and the
 * most specific entry wins.
 */
export class CompatIndex {
  readonly #tree: CompatTree;
  readonly #entries: Map<string, CompatEntry>;
  readonly #fallback: Map<string, CompatEntry>;
  readonly #problemsBelow = new Map<string, boolean>();

  public constructor(
    tree: CompatTree,
    entries: readonly CompatEntry[] = [],
    fallback: readonly CompatEntry[] = [],
  ) {
    this.#tree = tree;
    this.#entries = entryMap(entries);
    this.#fallback = entryMap(fallback);
  }

  public globalNames(): string[] {
    const globals = this.#tree.baseline['*globals*'];
    const treeNames =
      typeof globals === 'object' ? Object.keys(globals).filter(key => key !== '*self*') : [];
    const fallbackNames = [...this.#fallback.values()].flatMap(entry =>
      entry.module === '*globals*' ? entry.path.slice(0, 1) : [],
    );
    return [...new Set([...treeNames, ...fallbackNames])];
  }

  public lookup(api: ApiRef): LookupResult {
    const path = memberPath(api);
    const entry = findEntry(this.#entries, api.module, path);
    if (entry !== undefined) {
      return toResult(entry);
    }
    const tree = this.#lookupTree(api.module, path);
    if (tree !== undefined) {
      return tree;
    }
    const fallback = this.#fallbackFor(api.module, path);
    if (fallback !== undefined) {
      return toResult(fallback);
    }
    return { status: Object.hasOwn(this.#tree.baseline, api.module) ? 'supported' : 'uncovered' };
  }

  /** Whether anything at or below this API is unsupported, mocked or mismatched. */
  public hasProblemsBelow(api: ApiRef): boolean {
    const path = memberPath(api);
    const cacheKey = entryKey(api.module, path);
    let result = this.#problemsBelow.get(cacheKey);
    if (result === undefined) {
      result = this.#computeProblemsBelow(api.module, path);
      this.#problemsBelow.set(cacheKey, result);
    }
    return result;
  }

  /**
   * The tree's result, or `undefined` where it has nothing to compare: an API Node lacks too,
   * or a member below where the dump stops whose parent is supported.
   */
  #lookupTree(module: string, path: readonly string[]): LookupResult | undefined {
    const { baseline, runtime } = this.#tree;
    if (!Object.hasOwn(baseline, module)) {
      return undefined;
    }
    let base = baseline[module];
    let target = child(runtime, module);
    for (const segment of path) {
      if (typeof base !== 'object') {
        // The dump stops at leaves and at a depth limit; deeper members share a parent's problem.
        const parent = compare(base, target);
        return parent.status === 'supported' ? undefined : parent;
      }
      if (!Object.hasOwn(base, segment)) {
        return undefined;
      }
      base = base[segment];
      target = child(target, segment);
    }
    return compare(base, target);
  }

  /**
   * The most specific fallback entry, unless it applies to an API the tree describes: the tree
   * was read from the runtime itself, so its results win.
   */
  #fallbackFor(module: string, path: readonly string[]): CompatEntry | undefined {
    const entry = findEntry(this.#fallback, module, path);
    return entry !== undefined && this.#fallbackApplies(entry) ? entry : undefined;
  }

  #fallbackApplies(entry: CompatEntry): boolean {
    return !inDump(this.#tree.baseline, entry.module, entry.path);
  }

  #fallbackHasProblems(module: string, path: readonly string[]): boolean {
    const below = [...this.#fallback.values()].filter(
      entry => isBelow(entry, module, path) && this.#fallbackApplies(entry),
    );
    return [this.#fallbackFor(module, path), ...below].some(
      entry => entry !== undefined && entry.status !== 'supported',
    );
  }

  #computeProblemsBelow(module: string, path: readonly string[]): boolean {
    const entry = findEntry(this.#entries, module, path);
    if (
      (entry !== undefined && entry.status !== 'supported') ||
      [...this.#entries.values()].some(
        below => below.status !== 'supported' && isBelow(below, module, path),
      )
    ) {
      return true;
    }
    if (entry !== undefined) {
      // Curated as supported, and nothing below it says otherwise.
      return false;
    }
    return this.#treeHasProblems(module, path) || this.#fallbackHasProblems(module, path);
  }

  #treeHasProblems(module: string, path: readonly string[]): boolean {
    const { baseline, runtime } = this.#tree;
    if (!Object.hasOwn(baseline, module)) {
      return true;
    }
    let base = baseline[module];
    let target = child(runtime, module);
    for (const segment of path) {
      if (typeof base !== 'object') {
        return compare(base, target).status !== 'supported';
      }
      base = child(base, segment);
      target = child(target, segment);
    }
    return subtreeHasProblems(base, target);
  }
}
