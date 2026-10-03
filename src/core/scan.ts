import type { ModuleGraph } from '@/resolve/graph.ts';
import { PackageResolver } from '@/resolve/packages.ts';
import { reachedUsages } from '@/trace/reach.ts';

import { ImportChains } from './chains.ts';
import type { ModuleUsages } from './findings.ts';
import { extractScripts } from './scripts.ts';
import type { ScanOptions } from './scripts.ts';

export { toPosix } from './scripts.ts';
export { leaveOutSupplied } from './supplied.ts';
export type { SuppliedLoad } from './supplied.ts';
export type { ScanOptions } from './scripts.ts';

/** Extracts runtime API usages from every script in the graph, with its package and import chain. */
export function scanModules(
  graph: ModuleGraph,
  root: string,
  globals: ReadonlySet<string>,
  options: ScanOptions,
): ModuleUsages[] {
  const packages = new PackageResolver(root);
  const chains = new ImportChains(graph, packages);
  const scripts = extractScripts(graph, root, globals, options);
  const reached = options.trace
    ? reachedUsages(graph, new Map(scripts.map(({ file, found }) => [file, found])))
    : new Map(scripts.map(({ file, found }) => [file, found.usages]));
  return scripts.map(({ file, unchecked }) => ({
    file,
    package: packages.packageFor(file),
    chain: chains.chainTo(file),
    usages: [...(reached.get(file) ?? []), ...unchecked],
  }));
}
