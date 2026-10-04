import { wholeExport } from '@/extract/bindings.ts';
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
  for (const target of reexportedFiles(graph, modules)) {
    opened.add(target);
  }
  return opened;
}

/** Files that another file re-exports: with `export *`, `export { x } from`, or `exports.x = require('./file')`. */
function reexportedFiles(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
): Set<string> {
  const reexported = new Set<string>();
  for (const [file, { shape }] of modules) {
    const specifiers = [
      ...(shape?.stars ?? []),
      ...[...(shape?.exports.values() ?? [])].flatMap(item =>
        'specifier' in item ? item.specifier : [],
      ),
    ];
    for (const specifier of specifiers) {
      const target = targetOf(graph, file, specifier);
      if (target !== undefined) {
        reexported.add(target);
      }
    }
  }
  return reexported;
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
  seedNamespaces(graph, modules, demands, opened, { seeds, followed });
  seedWholeExports(graph, modules, { seeds, followed });
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

/**
 * The same for a whole file that a module imports as `import * as ns` and reads by member. The file
 * is asked for the names that the graph reads from it, so each of them that is a Node.js module
 * there is that module in this module.
 */
function seedNamespaces(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
  demands: ReadonlyMap<string, Demand>,
  opened: ReadonlySet<string>,
  found: FollowedAliases,
): void {
  for (const [file, { shape }] of modules) {
    const specifiers = [...(shape?.imports ?? [])].flatMap(([local, item]) =>
      item.imported === '*' && shape?.bindings.has(local) === true ? item.specifier : [],
    );
    for (const specifier of new Set(specifiers)) {
      const target = targetOf(graph, file, specifier);
      const asked = target === undefined ? undefined : demands.get(target);
      for (const name of asked instanceof Set ? asked : []) {
        const alias = target === undefined ? undefined : modules.get(target)?.aliases.get(name);
        if (target === undefined || alias === undefined) {
          continue;
        }
        const own = found.seeds.get(file) ?? new Map<string, ApiRef>();
        found.seeds.set(file, own.set(`${specifier}\0${name}`, alias.ref));
        if (!opened.has(target)) {
          const offsets = found.followed.get(target) ?? new Set<number>();
          found.followed.set(target, offsets.add(alias.offset));
        }
      }
    }
  }
}

/**
 * A file that sets `module.exports` to a Node.js module is that module in the files that
 * `require` it. The importer binds the result to a name, or destructures it, and its own code
 * reads that name, so what it does with the module is seen there. When every file that loads it
 * does so, nothing reaches the module unseen and the export is followed.
 */
function seedWholeExports(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
  found: FollowedAliases,
): void {
  const reexported = reexportedFiles(graph, modules);
  for (const [target, { aliases }] of modules) {
    const whole = aliases.get(wholeExport);
    if (whole === undefined) {
      continue;
    }
    const importers = [...graph.modules].flatMap(([file, module]) =>
      module.links.filter(link => link.path === target).map(link => ({ file, link })),
    );
    const seen = importers.every(
      ({ file, link }) =>
        link.kind === 'require-call' && bindsLoad(modules.get(file)?.shape, link.original ?? ''),
    );
    for (const { file, link } of importers) {
      const key = `${link.original ?? ''}\0${wholeExport}`;
      found.seeds.set(
        file,
        (found.seeds.get(file) ?? new Map<string, ApiRef>()).set(key, whole.ref),
      );
    }
    if (
      importers.length > 0 &&
      seen &&
      !reexported.has(target) &&
      !graph.entries.includes(target)
    ) {
      found.followed.set(
        target,
        (found.followed.get(target) ?? new Set<number>()).add(whole.offset),
      );
    }
  }
}

/** Whether every `require(specifier)` of a file is the value of a declarator that binds the result to a name or destructures it. */
function bindsLoad(shape: ExtractedModule['shape'], specifier: string): boolean {
  return (
    shape !== undefined &&
    shape.specifiers.has(specifier) &&
    !shape.unboundRequires.has(specifier) &&
    [...shape.imports].some(
      ([local, item]) =>
        item.specifier === specifier && (item.imported !== '*' || shape.bindings.has(local)),
    )
  );
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
