import type { Node } from 'oxc-parser';

import { displayApi } from '@/data/builtins.ts';
import type {
  ApiRef,
  GlobalCondition,
  Location,
  PassedKey,
  RuntimeCondition,
  Usage,
} from '@/types.ts';

import type { ComputedKey } from './chain.ts';
import { GuardStack } from './guard-stack.ts';
import type { Guard } from './guard-stack.ts';
import { functionGuards } from './guarded-functions.ts';
import type { LocalFunction } from './local-functions.ts';
import { omitMainFunctions } from './main-only.ts';
import { isPromiseApi, normalizeRef } from './refs.ts';

/** Adds the keys of a call to its usage. A name imported once may be called more than once. */
export function addPassedKeys(usage: Usage, keys: readonly PassedKey[]): void {
  const all = [...(usage.passedKeys ?? []), ...keys];
  usage.passedKeys = all.filter(
    (passed, index) =>
      all.findIndex(other => other.key === passed.key && other.value === passed.value) === index,
  );
}

function unique<TItem>(items: readonly TItem[]): TItem[] {
  return [...new Map(items.map(item => [JSON.stringify(item), item])).values()];
}

export class UsageCollector {
  public readonly omitMainFunctions = (
    body: readonly Node[],
    functions: ReadonlyMap<string, LocalFunction>,
    dead: ReadonlySet<Node>,
  ): void => {
    omitMainFunctions(body, functions, dead, this);
  };

  /** Adds the guards that hold whenever a local function runs to the usages in its body. */
  public readonly guardFunctions = (
    body: readonly Node[],
    functions: ReadonlyMap<string, LocalFunction>,
    seen: ReadonlyMap<number, readonly Guard[]>,
  ): void => {
    for (const [fn, guards] of functionGuards(body, functions, seen)) {
      this.guards.within(guards, () => {
        for (let index = this.offsets.length - 1; index >= 0; index -= 1) {
          const offset = this.offsets[index] ?? -1;
          const usage = this.usages[index];
          if (usage === undefined || offset < fn.start || offset >= fn.end) continue;
          if (this.guards.dead()) {
            this.offsets.splice(index, 1);
            this.usages.splice(index, 1);
          } else {
            this.#addGuards(usage);
          }
        }
      });
    }
  };

  public readonly usages: Usage[] = [];
  /** Where each usage was found in the source, in the order of `usages`. */
  public readonly offsets: number[] = [];
  /** The APIs known to exist at the point being visited. */
  public readonly guards = new GuardStack();
  /** Importing a Node.js module is not a use of it: only what is read from it is. */
  public readonly lazyNodeImports: boolean;
  /** What the module exports that is a Node.js module of its own, by exported name. */
  public readonly aliases = new Map<string, { ref: ApiRef; offset: number }>();
  /** What the module exports that is a plain string, by exported name. */
  public readonly strings = new Map<string, string>();
  /** Imported local names that another module of the graph exports as a plain string. */
  public readonly importedStrings: ReadonlyMap<string, string>;
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
    importedStrings: ReadonlyMap<string, string> = new Map(),
  ) {
    this.importedModules = importedModules;
    this.importedStrings = importedStrings;
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

  /**
   * `key` is the name that holds the key of a computed read, which a check of the same read guards.
   * Gives the usage it records, so the keys of a later call can be added to it.
   */
  public api(ref: ApiRef, offset: number, awaited = false, key?: ComputedKey): Usage | undefined {
    if (this.guards.dead()) {
      return undefined;
    }
    // A module as a whole is never read in this mode, so it is not a use that can fail.
    if (this.lazyNodeImports && ref.module !== '*globals*' && ref.path.length === 0) {
      return undefined;
    }
    const api = normalizeRef(ref);
    const guarded = this.guards.covers(api, key);
    // A rejected promise that nothing awaits is not an error of the `try`.
    const caught = this.guards.isCaught() && (awaited || !isPromiseApi(api));
    const afterLoad = api.path.length > 0 && this.guards.afterLoad(api);
    const usage: Usage = {
      kind: 'api',
      api,
      display: displayApi(api.module, api.path),
      location: this.location(offset),
      ...(guarded ? { guarded: true as const } : {}),
      ...(caught ? { caught: true as const } : {}),
      ...(afterLoad ? { afterLoad: true as const } : {}),
      ...this.#runtimes(),
      ...this.#globals(),
      ...this.#options(),
    };
    this.offsets.push(offset);
    this.usages.push(usage);
    return usage;
  }

  /**
   * Records the call of a name that is recorded at its import, such as `connect` of
   * `import { connect } from 'node:tls'`, when the call passes known keys. The usage counts only for
   * an API whose data names the options that fail, so the other results stay the same.
   */
  public optionCall(ref: ApiRef, offset: number, keys: readonly PassedKey[]): void {
    const usage = this.api(ref, offset);
    if (usage !== undefined) {
      usage.onlyForOptions = true;
      addPassedKeys(usage, keys);
    }
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
      ...this.#globals(),
      ...this.#options(),
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
      ...this.#globals(),
      ...this.#options(),
    });
  }

  #addGuards(usage: Usage): void {
    if (usage.kind === 'api' && usage.api !== undefined && this.guards.covers(usage.api)) {
      usage.guarded = true;
    }
    const runtimes = unique([...(usage.runtimes ?? []), ...this.guards.runtimes()]);
    const globals = unique([...(usage.globals ?? []), ...this.guards.globals()]);
    const options = unique([...(usage.options ?? []), ...this.guards.options()]);
    Object.assign(
      usage,
      usage.polyfill === undefined ? this.#polyfill() : {},
      runtimes.length === 0 ? {} : { runtimes },
      globals.length === 0 ? {} : { globals },
      options.length === 0 ? {} : { options },
    );
  }

  #polyfill(): { polyfill?: ApiRef } {
    const polyfill = this.guards.polyfill();
    return polyfill === undefined ? {} : { polyfill };
  }

  #globals(): { globals?: GlobalCondition[] } {
    const globals = this.guards.globals();
    return globals.length === 0 ? {} : { globals };
  }

  #options(): { options?: string[] } {
    const options = this.guards.options();
    return options.length === 0 ? {} : { options };
  }

  #runtimes(): { runtimes?: RuntimeCondition[] } {
    const runtimes = this.guards.runtimes();
    return runtimes.length === 0 ? {} : { runtimes };
  }
}
