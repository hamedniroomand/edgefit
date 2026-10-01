import type { ExportSource, ModuleShape, Unit } from './shape.ts';

/** The export names asked of a module, or `all` when any of them may be used. */
export type Demand = Set<string> | 'all';

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

/** The units of a module that are used, found by following the names that used code mentions. */
class Analyzer {
  public readonly live = new Set<Unit>();
  public readonly asks = new Map<string, Demand>();
  readonly #shape: ModuleShape;
  readonly #pending: string[] = [];
  readonly #seen = new Set<string>();

  public constructor(shape: ModuleShape) {
    this.#shape = shape;
  }

  public use(name: string): void {
    if (!this.#seen.has(name)) {
      this.#seen.add(name);
      this.#pending.push(name);
    }
  }

  public keep(unit: Unit): void {
    if (!this.live.has(unit)) {
      this.live.add(unit);
      for (const name of unit.mentions) {
        this.use(name);
      }
    }
  }

  public route(source: ExportSource | undefined): void {
    if (source !== undefined && 'local' in source) {
      this.use(source.local);
    } else if (source !== undefined) {
      merge(this.asks, ...askOf(source));
    }
  }

  /** Follows every name used so far to the units that declare it and the modules it comes from. */
  public settle(): void {
    for (let name = this.#pending.pop(); name !== undefined; name = this.#pending.pop()) {
      this.#follow(name);
    }
  }

  #keepDeclared(name: string): void {
    for (const unit of this.#shape.declared.get(name) ?? []) {
      this.keep(unit);
    }
  }

  #follow(name: string): void {
    const dot = name.indexOf('.');
    if (dot > 0) {
      // `object.member`: of a module imported as a whole, only that member is used.
      const object = name.slice(0, dot);
      const source = this.#shape.imports.get(object);
      if (source?.imported === '*' && this.#shape.bindings.has(object)) {
        this.#keepDeclared(object);
        merge(this.asks, source.specifier, new Set([name.slice(dot + 1)]));
      } else {
        this.use(object);
      }
      return;
    }
    this.#keepDeclared(name);
    const source = this.#shape.imports.get(name);
    if (source !== undefined) {
      merge(this.asks, ...askOf(source));
    }
  }
}

/** Which units of a module are used, given the exports asked of it, and what they ask in turn. */
export function analyze(shape: ModuleShape, asked: Demand): Analysis {
  // A CommonJS module without an `__esModule` marker is its own `default` export: all of it.
  const demand =
    asked !== 'all' && asked.has('default') && shape.commonJs && !shape.esModule ? 'all' : asked;
  const analyzer = new Analyzer(shape);
  // Code that runs when the module loads is always used.
  for (const unit of shape.units) {
    if (unit.name === undefined) {
      analyzer.keep(unit);
    }
  }
  for (const name of demand === 'all' ? shape.exports.keys() : demand) {
    analyzer.route(shape.exports.get(name));
  }
  for (const star of shape.stars) {
    merge(analyzer.asks, star, demand);
  }
  analyzer.settle();
  return { live: analyzer.live, asks: analyzer.asks };
}
