import type { ExtractedModule } from '@/extract/index.ts';
import type { ModuleGraph } from '@/resolve/graph.ts';
import type { Usage } from '@/types.ts';

import { analyze } from './analyze.ts';
import type { Demand } from './analyze.ts';
import type { ModuleShape, Unit } from './shape.ts';

/** Whether esbuild found the link as `import … from` or as a `require` of a written-out specifier. */
function isStatic(kind: string): boolean {
  return kind === 'import-statement' || kind === 'require-call';
}

class Demands {
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
}

/** What a module asks of the files that it loads with `import()` or `require()`, by the kind of the link. */
function loadsFor(
  shape: ModuleShape | undefined,
  kind: string,
): ModuleShape['dynamicImports'] | undefined {
  return { 'dynamic-import': shape?.dynamicImports, 'require-call': shape?.requires }[kind];
}

/**
 * Asks for every export of the modules that something may reach in any way: the entry, and
 * anything imported other than by a static import whose specifier was read from a module that
 * can be traced.
 */
function seedDemands(graph: ModuleGraph, shapes: ReadonlyMap<string, ModuleShape>): Demands {
  const demands = new Demands();
  for (const entry of graph.entries) {
    demands.raise(entry, 'all');
  }
  for (const [file, module] of graph.modules) {
    const shape = shapes.get(file);
    for (const link of module.links) {
      const named =
        shape?.traceable === true &&
        isStatic(link.kind) &&
        shape.specifiers.has(link.original ?? '');
      // A file loaded with `import()` or `require()` that only gets destructured by name is asked
      // for those names. An understood `require` is already read through `named`.
      const loaded = loadsFor(shape, link.kind)?.get(link.original ?? '');
      // The names a file reads are known whether or not its own exports can be told apart.
      const asked = link.kind === 'dynamic-import' || !named ? loaded : undefined;
      if (asked instanceof Set) {
        demands.raise(link.path, asked);
      } else if (!named) {
        demands.raise(link.path, 'all');
      }
    }
  }
  return demands;
}

/**
 * Finds the units each module uses, starting from the whole entry and following only the names
 * that modules import from each other. A module left out of the result is used in full: its
 * exports cannot be told apart.
 */
export function traceReach(
  graph: ModuleGraph,
  shapes: ReadonlyMap<string, ModuleShape>,
): { traced: Map<string, Set<Unit>>; demands: ReadonlyMap<string, Demand> } {
  const demands = seedDemands(graph, shapes);
  const traced = new Map<string, Set<Unit>>();
  const queue = [...graph.modules.keys()];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    const shape = shapes.get(file);
    if (shape?.traceable !== true) {
      continue;
    }
    const { live, asks } = analyze(shape, demands.get(file));
    traced.set(file, live);
    for (const link of graph.modules.get(file)?.links ?? []) {
      const names = isStatic(link.kind) ? asks.get(link.original ?? '') : undefined;
      if (names !== undefined && demands.raise(link.path, names)) {
        queue.push(link.path);
      }
    }
  }
  return { traced, demands: demands.all() };
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
): Map<string, Usage[]> {
  const { traced } = traceReach(graph, shapesOf(modules));
  return new Map(
    [...modules].map(([file, module]) => {
      const live = traced.get(file);
      const { shape } = module;
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
