import type { ModuleGraph } from '@/resolve/graph.ts';
import type { PackageResolver } from '@/resolve/packages.ts';

/** Shortest import chains from the nearest entry, found by one breadth-first search from every entry. */
export class ImportChains {
  readonly #parents = new Map<string, string | undefined>();
  readonly #packages: PackageResolver;

  public constructor(graph: ModuleGraph, packages: PackageResolver) {
    this.#packages = packages;
    const queue = [...graph.entries];
    for (const entry of queue) {
      this.#parents.set(entry, undefined);
    }
    for (let index = 0; index < queue.length; index += 1) {
      const file = queue[index] ?? '';
      for (const imported of graph.modules.get(file)?.imports ?? []) {
        if (!this.#parents.has(imported)) {
          this.#parents.set(imported, file);
          queue.push(imported);
        }
      }
    }
  }

  /** Display names from the entry to `file`, with each package's internal files collapsed into its name. */
  public chainTo(file: string): string[] {
    const files: string[] = [];
    for (
      let current: string | undefined = file;
      current !== undefined;
      current = this.#parents.get(current)
    ) {
      files.unshift(current);
    }
    const chain: string[] = [];
    for (const current of files) {
      const name = this.#packages.packageFor(current)?.name ?? current;
      if (chain.at(-1) !== name) {
        chain.push(name);
      }
    }
    return chain;
  }
}
