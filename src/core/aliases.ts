import type { ExtractedModule } from '@/extract/index.ts';
import type { ModuleGraph } from '@/resolve/graph.ts';
import { exportDemands } from '@/trace/reach.ts';
import type { ApiRef } from '@/types.ts';

export interface FollowedAliases {
  /** For each importing file: the local names that stand for a Node.js module another file exports. */
  seeds: Map<string, Map<string, ApiRef>>;
  /** For each exporting file: where the exports are that every user of the graph is known. */
  followed: Map<string, Set<number>>;
}

/** The file that a static import of `specifier` in `file` goes to. */
function targetOf(graph: ModuleGraph, file: string, specifier: string): string | undefined {
  return graph.modules
    .get(file)
    ?.links.find(
      link =>
        link.original === specifier && ['import-statement', 'require-call'].includes(link.kind),
    )?.path;
}

/**
 * Files that a module of the graph reads in a way that is not followed: as a whole (`import * as`,
 * `export *`, or an `export { x } from`), or with `require()` or `import()`. What they export may
 * reach code that is not followed.
 */
function openedFiles(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
): Set<string> {
  const opened = new Set<string>();
  // Only an `import` statement binds the names, so a file that is required is read in a way not followed.
  for (const { links } of graph.modules.values()) {
    for (const link of links.filter(item => item.kind !== 'import-statement')) {
      opened.add(link.path);
    }
  }
  for (const [file, { shape }] of modules) {
    const specifiers = [
      ...(shape?.stars ?? []),
      ...[...(shape?.imports.values() ?? [])]
        .filter(item => item.imported === '*')
        .map(item => item.specifier),
      ...[...(shape?.exports.values() ?? [])].flatMap(item =>
        'specifier' in item ? item.specifier : [],
      ),
    ];
    for (const specifier of specifiers) {
      const target = targetOf(graph, file, specifier);
      if (target !== undefined) {
        opened.add(target);
      }
    }
  }
  return opened;
}

/**
 * A Node.js module that a file exports under a name, and another file of the graph imports under
 * that name, is that module there. The names the graph asks of a file say who uses its exports.
 * An export of a file that is imported as a whole, or that the entry may use, is not followed
 * away from `unknown`, because a user outside the graph can reach it.
 */
export function followAliases(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
): FollowedAliases {
  const demands = exportDemands(graph, modules);
  const opened = openedFiles(graph, modules);
  const seeds = new Map<string, Map<string, ApiRef>>();
  const followed = new Map<string, Set<number>>();
  for (const [file, { shape }] of modules) {
    for (const [local, { specifier, imported }] of shape?.imports ?? []) {
      const target = targetOf(graph, file, specifier);
      const alias = target === undefined ? undefined : modules.get(target)?.aliases.get(imported);
      if (target === undefined || alias === undefined) {
        continue;
      }
      seeds.set(file, (seeds.get(file) ?? new Map<string, ApiRef>()).set(local, alias.ref));
      const asked = demands.get(target);
      if (asked !== undefined && asked !== 'all' && !opened.has(target)) {
        followed.set(target, (followed.get(target) ?? new Set<number>()).add(alias.offset));
      }
    }
  }
  return { seeds, followed };
}

/** Drops the `unknown` of the exports that are followed, from the module that writes them. */
export function dropFollowed(
  found: ExtractedModule,
  offsets: ReadonlySet<number> | undefined,
): ExtractedModule {
  if (offsets === undefined) {
    return found;
  }
  const keep = found.usages.map(
    (usage, index) =>
      !(
        usage.kind === 'dynamic' &&
        usage.exported === true &&
        offsets.has(found.offsets[index] ?? -1)
      ),
  );
  return {
    ...found,
    usages: found.usages.filter((_usage, index) => keep[index] === true),
    offsets: found.offsets.filter((_offset, index) => keep[index] === true),
  };
}
