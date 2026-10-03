import type { ExtractedModule } from '@/extract/index.ts';
import type { ModuleGraph } from '@/resolve/graph.ts';
import type { Demand } from '@/trace/analyze.ts';
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
  for (const [file, module] of graph.modules) {
    const shape = modules.get(file)?.shape;
    for (const link of module.links.filter(item => item.kind !== 'import-statement')) {
      // An `import()` or `require()` that only destructures names is followed, like an import of those names.
      const loaded = { 'dynamic-import': shape?.dynamicImports, 'require-call': shape?.requires }[
        link.kind
      ];
      if (!(loaded?.get(link.original ?? '') instanceof Set)) {
        opened.add(link.path);
      }
    }
  }
  for (const [file, { shape }] of modules) {
    const specifiers = [
      ...(shape?.stars ?? []),
      // A `require` of a whole file that is only read by member asks for those members, see `loadsOf`.
      ...[...(shape?.imports ?? [])]
        .filter(([local, item]) => item.imported === '*' && shape?.bindings.has(local) !== true)
        .map(([, item]) => item.specifier),
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
  seedLoads(graph, modules, demands, opened, { seeds, followed });
  return { seeds, followed };
}

/** The same for the names that a file destructures from `await import('./file')` or `require('./file')`. */
function seedLoads(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
  demands: ReadonlyMap<string, Demand>,
  opened: ReadonlySet<string>,
  found: FollowedAliases,
): void {
  for (const [file, { shape }] of modules) {
    const loads = [
      ...[...(shape?.dynamicImports ?? [])].map(([specifier, names]) => ({
        specifier,
        names,
        kind: 'dynamic-import',
      })),
      ...[...(shape?.requires ?? [])].map(([specifier, names]) => ({
        specifier,
        names,
        kind: 'require-call',
      })),
    ];
    for (const { specifier, names, kind } of loads) {
      const target = graph.modules
        .get(file)
        ?.links.find(link => link.kind === kind && link.original === specifier)?.path;
      if (!(names instanceof Set) || target === undefined) {
        continue;
      }
      for (const name of names) {
        const alias = modules.get(target)?.aliases.get(name);
        if (alias === undefined) {
          continue;
        }
        found.seeds.set(
          file,
          (found.seeds.get(file) ?? new Map<string, ApiRef>()).set(
            `${specifier}\0${name}`,
            alias.ref,
          ),
        );
        const asked = demands.get(target);
        if (asked !== undefined && asked !== 'all' && !opened.has(target)) {
          found.followed.set(
            target,
            (found.followed.get(target) ?? new Set<number>()).add(alias.offset),
          );
        }
      }
    }
  }
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
