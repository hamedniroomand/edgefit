import type { ExtractedModule } from '@/extract/index.ts';
import type { ModuleGraph } from '@/resolve/graph.ts';
import type { Usage } from '@/types.ts';

import { reachedUsages } from './reach.ts';

/** The export names of the one module that the entry file imports, when all of them are known. */
function exportsOfImported(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
): { entry: string; names: string[] } | undefined {
  const [entry] = graph.entries;
  const links = entry === undefined ? undefined : graph.modules.get(entry)?.links;
  const target = links?.length === 1 ? links[0]?.path : undefined;
  const shape = target === undefined ? undefined : modules.get(target)?.shape;
  if (entry === undefined || shape?.traceable !== true || shape.stars.length > 0) {
    return undefined;
  }
  return { entry, names: [...shape.exports.keys()] };
}

function tagged(usage: Usage, through: string[] | undefined, count: number): Usage {
  return through === undefined || through.length === count ? usage : { ...usage, exports: through };
}

/**
 * Names the exports that reach a usage, when only some of them do. The entry file asks for one
 * export at a time, and a usage that code reaches for each of them, or for none, is left as it is.
 */
export function tagUsagesByExport(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
  reached: ReadonlyMap<string, Usage[]>,
): Map<string, Usage[]> {
  const imported = exportsOfImported(graph, modules);
  if (imported === undefined || imported.names.length < 2) {
    return new Map(reached);
  }
  const through = new Map<Usage, string[]>();
  for (const name of imported.names) {
    const alone = reachedUsages(graph, modules, { entry: imported.entry, names: new Set([name]) });
    for (const usage of [...alone.values()].flat()) {
      through.set(usage, [...(through.get(usage) ?? []), name]);
    }
  }
  return new Map(
    [...reached].map(([file, usages]) => [
      file,
      usages.map(usage => tagged(usage, through.get(usage), imported.names.length)),
    ]),
  );
}
