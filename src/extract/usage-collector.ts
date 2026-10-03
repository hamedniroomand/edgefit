import { displayApi } from '@/data/builtins.ts';
import type { ApiRef, Location, RuntimeCondition, Usage } from '@/types.ts';

import { GuardStack } from './guard-stack.ts';
import { isPromiseApi, normalizeRef } from './refs.ts';

export class UsageCollector {
  public readonly usages: Usage[] = [];
  /** Where each usage was found in the source, in the order of `usages`. */
  public readonly offsets: number[] = [];
  /** The APIs known to exist at the point being visited. */
  public readonly guards = new GuardStack();
  /** Importing a Node.js module is not a use of it: only what is read from it is. */
  public readonly lazyNodeImports: boolean;
  /** What the module exports that is a Node.js module of its own, by exported name. */
  public readonly aliases = new Map<string, { ref: ApiRef; offset: number }>();
  /** Imported local names that another module of the graph exports as a Node.js module. */
  public readonly importedModules: ReadonlyMap<string, ApiRef>;
  /** Specifiers that resolve to a native addon. */
  readonly #nativeSpecifiers: ReadonlyMap<string, string>;
  readonly #file: string;
  readonly #lineStarts: number[] = [0];

  public constructor(
    file: string,
    source: string,
    lazyNodeImports = false,
    nativeSpecifiers: ReadonlyMap<string, string> = new Map(),
    importedModules: ReadonlyMap<string, ApiRef> = new Map(),
  ) {
    this.importedModules = importedModules;
    this.#file = file;
    this.#nativeSpecifiers = nativeSpecifiers;
    this.lazyNodeImports = lazyNodeImports;
    for (let index = source.indexOf('\n'); index !== -1; index = source.indexOf('\n', index + 1)) {
      this.#lineStarts.push(index + 1);
    }
  }

  public location(offset: number): Location {
    let low = 0;
    let high = this.#lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((this.#lineStarts[middle] ?? 0) <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return { file: this.#file, line: low + 1, column: offset - (this.#lineStarts[low] ?? 0) + 1 };
  }

  public api(ref: ApiRef, offset: number, awaited = false): void {
    if (this.guards.dead()) {
      return;
    }
    // A module as a whole is never read in this mode, so it is not a use that can fail.
    if (this.lazyNodeImports && ref.module !== '*globals*' && ref.path.length === 0) {
      return;
    }
    const api = normalizeRef(ref);
    const guarded = this.guards.covers(api);
    // A rejected promise that nothing awaits is not an error of the `try`.
    const caught = this.guards.isCaught() && (awaited || !isPromiseApi(api));
    this.offsets.push(offset);
    this.usages.push({
      kind: 'api',
      api,
      display: displayApi(api.module, api.path),
      location: this.location(offset),
      ...(guarded ? { guarded: true as const } : {}),
      ...(caught ? { caught: true as const } : {}),
      ...this.#runtimes(),
    });
  }

  /** Records the import of a native addon, if `specifier` resolves to one. */
  public native(specifier: string, offset: number): void {
    const name = this.#nativeSpecifiers.get(specifier);
    if (this.guards.dead() || name === undefined) {
      return;
    }
    this.offsets.push(offset);
    this.usages.push({
      kind: 'native',
      api: undefined,
      display: `native addon ${name}`,
      location: this.location(offset),
      // A `try` that catches the error of a missing addon guards the import.
      ...(this.guards.isCaught() ? { guarded: true as const } : {}),
      ...this.#runtimes(),
    });
  }

  /** Records an access edgefit cannot follow statically. */
  public dynamic(
    ref: ApiRef | undefined,
    display: string,
    reason: string,
    offset: number,
    exported = false,
    supplied = false,
  ): void {
    if (this.guards.dead()) {
      return;
    }
    this.offsets.push(offset);
    this.usages.push({
      kind: 'dynamic',
      api: ref === undefined ? undefined : normalizeRef(ref),
      display,
      reason,
      location: this.location(offset),
      ...(exported ? { exported: true as const } : {}),
      ...(supplied ? { supplied: true as const } : {}),
      ...this.#polyfill(),
      ...this.#runtimes(),
    });
  }

  #polyfill(): { polyfill?: ApiRef } {
    const polyfill = this.guards.polyfill();
    return polyfill === undefined ? {} : { polyfill };
  }

  #runtimes(): { runtimes?: RuntimeCondition[] } {
    const runtimes = this.guards.runtimes();
    return runtimes.length === 0 ? {} : { runtimes };
  }
}
