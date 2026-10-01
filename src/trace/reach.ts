import type { ExtractedModule } from '@/extract/index.ts';
import type { ModuleGraph } from '@/resolve/graph.ts';
import type { Usage } from '@/types.ts';

import type { ExportSource, ModuleShape, Unit } from './shape.ts';

/** The export names asked of a module, or `all` when any of them may be used. */
type Demand = Set<string> | 'all';

function merge(asks: Map<string, Demand>, specifier: string, names: Demand): void {
  const current = asks.get(specifier);
  if (current !== 'all') {
    asks.set(specifier, names === 'all' ? 'all' : new Set([...(current ?? []), ...names]));
  }
}

/** What using something that stands for `source` asks of the module it comes from. */
function askOf(source: { specifier: string; imported: string }): [string, Demand] {
  return [source.specifier, source.imported === '*' ? 'all' : new Set([source.imported])];
}

interface Analysis {
  live: Set<Unit>;
  /** What the module asks of the modules it imports, by specifier. */
  asks: Map<string, Demand>;
}

/** Which units of a module are used, given the exports asked of it, and what they ask in turn. */
function analyze(shape: ModuleShape, demand: Demand): Analysis {
  const live = new Set<Unit>();
  const asks = new Map<string, Demand>();
  const pending: string[] = [];
  const seen = new Set<string>();
  const use = (name: string): void => {
    if (!seen.has(name)) {
      seen.add(name);
      pending.push(name);
    }
  };
  const keep = (unit: Unit): void => {
    if (!live.has(unit)) {
      live.add(unit);
      for (const name of unit.mentions) {
        use(name);
      }
    }
  };
  const route = (source: ExportSource | undefined): void => {
    if (source !== undefined && 'local' in source) {
      use(source.local);
    } else if (source !== undefined) {
      merge(asks, ...askOf(source));
    }
  };

  // Code that runs when the module loads is always used.
  for (const unit of shape.units) {
    if (unit.name === undefined) {
      keep(unit);
    }
  }
  for (const name of demand === 'all' ? shape.exports.keys() : demand) {
    route(shape.exports.get(name));
  }
  for (const star of shape.stars) {
    merge(asks, star, demand);
  }
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    for (const unit of shape.declared.get(name) ?? []) {
      keep(unit);
    }
    const source = shape.imports.get(name);
    if (source !== undefined) {
      merge(asks, ...askOf(source));
    }
  }
  return { live, asks };
}

class Demands {
  readonly #demands = new Map<string, Demand>();

  public get(file: string): Demand {
    return this.#demands.get(file) ?? new Set();
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

/**
 * Asks for every export of the modules that something may reach in any way: the entry, and
 * anything imported other than by a static import whose specifier was read from a module that
 * can be traced.
 */
function seedDemands(graph: ModuleGraph, shapes: ReadonlyMap<string, ModuleShape>): Demands {
  const demands = new Demands();
  demands.raise(graph.entry, 'all');
  for (const [file, module] of graph.modules) {
    const shape = shapes.get(file);
    for (const link of module.links) {
      const named =
        shape?.traceable === true &&
        link.kind === 'import-statement' &&
        shape.specifiers.has(link.original ?? '');
      if (!named) {
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
): Map<string, Set<Unit>> {
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
      const names = link.kind === 'import-statement' ? asks.get(link.original ?? '') : undefined;
      if (names !== undefined && demands.raise(link.path, names)) {
        queue.push(link.path);
      }
    }
  }
  return traced;
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

/** The usages of each module that sit in code something uses. The rest are left out. */
export function reachedUsages(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
): Map<string, Usage[]> {
  const shapes = new Map<string, ModuleShape>();
  for (const [file, module] of modules) {
    if (module.shape !== undefined) {
      shapes.set(file, module.shape);
    }
  }
  const traced = traceReach(graph, shapes);
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
