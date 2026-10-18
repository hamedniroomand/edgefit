import type { HeldGuards } from '@/extract/guard-stack.ts';
import type { ExtractedModule } from '@/extract/index.ts';
import type { ModuleGraph } from '@/resolve/graph.ts';

type Source = { file: string; name: string };

/** The file that a static import of `specifier` in `file` goes to. */
function targetOf(graph: ModuleGraph, file: string, specifier: string): string | undefined {
  return graph.modules
    .get(file)
    ?.links.find(link => link.original === specifier && link.kind === 'import-statement')?.path;
}

/** Where `source` is re-exported from: `export { x } from`, or an import that is exported. */
function reexportedFrom(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
  source: Source,
): Source | undefined {
  const shape = modules.get(source.file)?.shape;
  const exported = shape?.exports.get(source.name);
  const from: { specifier: string; imported: string } | undefined =
    exported !== undefined && 'local' in exported ? shape?.imports.get(exported.local) : exported;
  const file = from === undefined ? undefined : targetOf(graph, source.file, from.specifier);
  return from === undefined || file === undefined ? undefined : { file, name: from.imported };
}

type Exported<TValue> = (module: ExtractedModule) => ReadonlyMap<string, TValue>;

/** The value that a file exports under a name, through any re-export of the name. */
function valueOf<TValue>(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
  start: Source,
  exported: Exported<TValue>,
): TValue | undefined {
  const seen = new Set<string>();
  for (
    let source: Source | undefined = start;
    source !== undefined && !seen.has(`${source.file}\0${source.name}`);
    source = reexportedFrom(graph, modules, source)
  ) {
    seen.add(`${source.file}\0${source.name}`);
    const module = modules.get(source.file);
    const value = module === undefined ? undefined : exported(module).get(source.name);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

/** For each importing file: the local names that stand for a value which another file of the graph exports. */
function followExports<TValue>(
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
  exported: Exported<TValue>,
): Map<string, Map<string, TValue>> {
  const seeds = new Map<string, Map<string, TValue>>();
  for (const [file, { shape }] of modules) {
    for (const [local, { specifier, imported }] of shape?.imports ?? []) {
      const target = targetOf(graph, file, specifier);
      const value =
        target === undefined
          ? undefined
          : valueOf(graph, modules, { file: target, name: imported }, exported);
      if (value !== undefined) {
        seeds.set(file, (seeds.get(file) ?? new Map<string, TValue>()).set(local, value));
      }
    }
  }
  return seeds;
}

/**
 * For each importing file: the local names that stand for a plain string which another file of the
 * graph exports under the name. A file reads such a name like a `const` of its own.
 * ponytail: `export * from` is not followed, because the name can come from any of its files. A
 * string that a file builds from an import of its own is not followed, because the first
 * extraction does not know it. Upgrade: run the extraction again until no new string appears.
 */
export const followStrings = (
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
): Map<string, Map<string, string>> => followExports(graph, modules, module => module.strings);

/**
 * For each importing file: the local names that stand for a `const` holding a check which another
 * file of the graph exports. The same limits apply as for strings: `export * from` is not followed,
 * and a check that a file builds from an import of its own is not followed, so that file gives
 * fewer guards, never more.
 */
export const followChecks = (
  graph: ModuleGraph,
  modules: ReadonlyMap<string, ExtractedModule>,
): Map<string, Map<string, HeldGuards>> => followExports(graph, modules, module => module.checks);
