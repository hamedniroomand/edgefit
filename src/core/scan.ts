import type { ModuleGraph } from '@/resolve/graph.ts';
import { PackageResolver } from '@/resolve/packages.ts';
import { tagUsagesByExport } from '@/trace/by-export.ts';
import { reachedUsages } from '@/trace/reach.ts';
import type { Usage } from '@/types.ts';

import { ImportChains } from './chains.ts';
import type { ModuleUsages } from './findings.ts';
import { extractScripts } from './scripts.ts';
import type { ScanOptions } from './scripts.ts';

export { toPosix } from './scripts.ts';
export { leaveOutSupplied } from './supplied.ts';
export type { SuppliedLoad } from './supplied.ts';
export type { ScanOptions } from './scripts.ts';

/**
 * Keeps on a usage only the options that no file of the graph sets, so a usage that sits behind
 * an option which the project sets (`fastify({ http2: true })`) is an ordinary usage.
 */
function withUnsetOptions(usage: Usage, set: ReadonlySet<string>): Usage {
  if (usage.options === undefined) {
    return usage;
  }
  const { options, ...rest } = usage;
  const unset = options.filter(name => !set.has(name));
  return unset.length === 0 ? rest : { ...rest, options: unset };
}

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
  const modules = new Map(scripts.map(({ file, found }) => [file, found]));
  const traced = options.trace ? reachedUsages(graph, modules) : undefined;
  const reached =
    traced === undefined
      ? new Map(scripts.map(({ file, found }) => [file, found.usages]))
      : options.byExport === true
        ? tagUsagesByExport(graph, modules, traced)
        : traced;
  const set = new Set(scripts.flatMap(({ found }) => found.optionsSet));
  return scripts.map(({ file, unchecked }) => ({
    file,
    package: packages.packageFor(file),
    chain: chains.chainTo(file),
    usages: [...(reached.get(file) ?? []), ...unchecked].map(usage => withUnsetOptions(usage, set)),
  }));
}
