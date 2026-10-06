import type { ExtractedModule } from '@/extract/index.ts';
import type { GraphModule, ModuleGraph } from '@/resolve/graph.ts';
import type { Usage } from '@/types.ts';

import { analyze } from './analyze.ts';
import type { Demand } from './analyze.ts';
import type { ModuleShape, Unit } from './shape.ts';

/** Whether esbuild found the link as `import … from` or as a `require` of a written-out specifier. */
function isStatic(kind: string): boolean {
  return kind === 'import-statement' || kind === 'require-call';
}

/** Whether the linked file runs when the module loads, whatever the module is asked for. */
function runsOnLoad(shape: ModuleShape, link: GraphModule['links'][number]): boolean {
  return (
    link.kind === 'import-statement' ||
    (link.kind === 'require-call' && shape.eagerRequires.has(link.original ?? ''))
  );
}

/** What is asked of each module, the modules that the trace loads, and the files left to analyze. */
class Demands {
  public readonly loaded = new Set<string>();
  public readonly queue: string[] = [];
  readonly #demands = new Map<string, Demand>();

  public get(file: string): Demand {
    return this.#demands.get(file) ?? new Set();
  }

  public all(): ReadonlyMap<string, Demand> {
    return this.#demands;
  }

  /** Adds to what is asked of a module, and says whether that asked for something new. */
  public raise(file: string, names: Demand): boolean {
    const current = this.get(file);
    if (current === 'all' || (names !== 'all' && [...names].every(name => current.has(name)))) {
      return false;
    }
    this.#demands.set(file, names === 'all' ? 'all' : new Set([...current, ...names]));
    return true;
  }

  /** Loads the file, and analyzes it again when `names` asks it for something new. */
  public visit(file: string, names?: Demand): void {
    const raised = names !== undefined && this.raise(file, names);
    if (raised || !this.loaded.has(file)) {
      this.loaded.add(file);
      this.queue.push(file);
    }
  }
}

/** What a module asks of the files that it loads with `import()` or `require()`, by the kind of the link. */
function loadsFor(
  shape: ModuleShape | undefined,
  kind: string,
): ModuleShape['dynamicImports'] | undefined {
  return { 'dynamic-import': shape?.dynamicImports, 'require-call': shape?.requires }[kind];
}

/** What the file `entry` asks of the module that it imports, in place of what its own code asks. */
export type EntryAsk = { entry: string; names: Set<string> };

/**
 * Asks for every export of the files that a module may load in any way other than by a static
 * import whose specifier was read from a module that can be traced.
 */
function seedLinks(
  links: GraphModule['links'],
  shape: ModuleShape | undefined,
  demands: Demands,
): void {
  for (const link of links) {
    const named =
      shape?.traceable === true && isStatic(link.kind) && shape.specifiers.has(link.original ?? '');
    // A file loaded with `import()` or `require()` that only gets destructured by name is asked
    // for those names. An understood `require` is already read through `named`.
    const loaded = loadsFor(shape, link.kind)?.get(link.original ?? '');
    // The names a file reads are known whether or not its own exports can be told apart.
    const asked = link.kind === 'dynamic-import' || !named ? loaded : undefined;
    if (asked instanceof Set) {
      demands.visit(link.path, asked);
    } else if (!named) {
      // ponytail: a `require` in a function whose result is not read loads its file for every
      // export of the module, not only for the export whose code holds the call.
      demands.visit(link.path, 'all');
    }
  }
}

/**
 * Finds the units each module uses, starting from the whole entry and following only the names
 * that modules import from each other. A module left out of `traced` is used in full: its
 * exports cannot be told apart. Without `ask`, every module of the graph is loaded. With `ask`,
 * only the modules that the asked names reach are.
 */
export function traceReach(
  graph: ModuleGraph,
  shapes: ReadonlyMap<string, ModuleShape>,
  ask?: EntryAsk,
): {
  traced: Map<string, Set<Unit>>;
  demands: ReadonlyMap<string, Demand>;
  loaded: ReadonlySet<string>;
} {
  const demands = new Demands();
  for (const file of ask === undefined ? graph.modules.keys() : []) {
    demands.visit(file);
  }
  for (const entry of graph.entries) {
    demands.visit(entry, 'all');
  }
  const seeded = new Set<string>();
  const traced = new Map<string, Set<Unit>>();
  for (let file = demands.queue.pop(); file !== undefined; file = demands.queue.pop()) {
    const shape = shapes.get(file);
    const links = graph.modules.get(file)?.links ?? [];
    if (!seeded.has(file) && file !== ask?.entry) {
      seedLinks(links, shape, demands);
    }
    seeded.add(file);
    if (shape?.traceable !== true) {
      continue;
    }
    const { live, asks } = analyze(shape, demands.get(file));
    traced.set(file, live);
    for (const link of links) {
      const asked = file === ask?.entry ? ask.names : asks.get(link.original ?? '');
      const names = isStatic(link.kind) ? asked : undefined;
      if (names !== undefined || runsOnLoad(shape, link)) {
        demands.visit(link.path, names);
      }
    }
  }
  return { traced, demands: demands.all(), loaded: demands.loaded };
}

/** The unit of a module that holds the offset, if it is in one. */
export function unitAt(shape: ModuleShape, offset: number): Unit | undefined {
  let low = 0;
  let high = shape.units.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const unit = shape.units[middle];
    if (unit === undefined || offset < unit.start) {
      high = middle - 1;
    } else if (offset >= unit.end) {
      low = middle + 1;
    } else {
      return unit;
    }
  }
  return undefined;
}

function shapesOf(modules: ReadonlyMap<string, ExtractedModule>): Map<string, ModuleShape> {
  const shapes = new Map<string, ModuleShape>();
  for (const [file, module] of modules) {
    if (module.shape !== undefined) {
      shapes.set(file, module.shape);
    }
  }
  return shapes;
}

/** The export names that the modules of the graph ask of each module, or `all`. */
export function exportDemands(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
): ReadonlyMap<string, Demand> {
  return traceReach(graph, shapesOf(modules)).demands;
}

/** The usages of each module that sit in code something uses. The rest are left out. */
export function reachedUsages(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
  ask?: EntryAsk,
): Map<string, Usage[]> {
  const { traced, loaded } = traceReach(graph, shapesOf(modules), ask);
  return new Map(
    [...modules].map(([file, module]) => {
      const live = traced.get(file);
      const { shape } = module;
      if (ask !== undefined && !loaded.has(file)) {
        return [file, []];
      }
      if (live === undefined || shape === undefined) {
        return [file, module.usages];
      }
      return [
        file,
        module.usages.filter((_usage, index) => {
          const unit = unitAt(shape, module.offsets[index] ?? -1);
          return unit === undefined || live.has(unit);
        }),
      ];
    }),
  );
}
