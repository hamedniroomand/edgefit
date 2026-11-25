import path from 'node:path';
import process from 'node:process';

import type { Demand } from './analyze.ts';
import type { ModuleShape, Unit } from './shape.ts';

/** The variable that turns the output on: an export name, or `*` for every trace. */
export const debugVariable = 'EDGEFIT_DEBUG_TRACE';

/** What one run of the trace found, for the debug output. */
export type TraceRun = {
  /** The names that the entry asks for, or `undefined` for the whole graph. */
  asked: ReadonlySet<string> | undefined;
  loaded: ReadonlySet<string>;
  demands: ReadonlyMap<string, Demand>;
  shapes: ReadonlyMap<string, ModuleShape>;
  traced: ReadonlyMap<string, ReadonlySet<Unit>>;
  /** The file that first asked each file for all of its exports. */
  fullBy: ReadonlyMap<string, string>;
};

/** Whether the variable asks for this run: `*`, or one of the names the entry asks for. */
function wanted(value: string | undefined, asked: ReadonlySet<string> | undefined): boolean {
  if (value === undefined || value === '') {
    return false;
  }
  return value === '*' || asked?.has(value) === true;
}

const shown = (file: string): string => path.relative(process.cwd(), file) || file;

/** The names of the live units, with the code that runs at load counted as one item. */
function unitNames(units: Iterable<Unit>): string {
  const list = [...units];
  const atLoad = list.filter(unit => unit.name === undefined).length;
  const names = list.flatMap(unit => (unit.name === undefined ? [] : [unit.name]));
  const all = [...(atLoad === 0 ? [] : [`${atLoad} at load`]), ...names];
  return all.length === 0 ? '' : ` [${all.join(', ')}]`;
}

/** One line for a file: whether it is traced, what is asked of it, and its live units. */
function fileLine(file: string, run: TraceRun): string {
  const shape = run.shapes.get(file);
  const demand = run.demands.get(file);
  const asked = demand === 'all' ? 'all' : [...(demand ?? [])].join(', ') || 'nothing';
  const by = run.fullBy.get(file);
  const from = by === undefined ? '' : ` (all from ${shown(by)})`;
  if (shape?.traceable !== true) {
    return `  ${shown(file)}  opaque  asked: ${asked}${from}`;
  }
  const live = run.traced.get(file) ?? new Set<Unit>();
  return `  ${shown(file)}  asked: ${asked}${from}  live: ${live.size}/${shape.units.length}${unitNames(live)}`;
}

/**
 * Prints the files that one run of the trace loads, what it asks of each one, which file first
 * asked a file for all of its exports, and the units that are live, when the debug variable asks
 * for the run. A file that is opaque counts in full.
 */
export function printTrace(run: TraceRun): void {
  const value = process.env[debugVariable];
  if (!wanted(value, run.asked)) {
    return;
  }
  const what = run.asked === undefined ? 'the whole graph' : [...run.asked].join(', ');
  const lines = [...run.loaded].toSorted().map(file => fileLine(file, run));
  process.stderr.write(`edgefit trace: ${what}\n${lines.join('\n')}\n`);
}
