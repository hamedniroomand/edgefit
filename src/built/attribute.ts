import path from 'node:path';

import type { ModuleUsages } from '@/core/findings.ts';
import { toPosix } from '@/core/scan.ts';
import { PackageResolver } from '@/resolve/packages.ts';
import type { Usage } from '@/types.ts';

import { OutputSourceMap } from './source-map.ts';
import { unenvUsage } from './unenv.ts';

export interface AttributedModules {
  modules: ModuleUsages[];
  notes: string[];
}

function unmappedNote(count: number): string {
  const files = count === 1 ? '1 output file has' : `${count} output files have`;
  return (
    `${files} no sourcemap mappings, so their findings point into the build output. ` +
    'Build with `sourcemap: true` (Nitro also needs `experimental.sourcemapMinify: false`) ' +
    'to report the original files and packages.'
  );
}

function withOwner(chain: readonly string[], owner: string): string[] {
  return chain.at(-1) === owner ? [...chain] : [...chain, owner];
}

/** Splits a chunk's usages by the original file each one maps to. Unmapped usages stay under `''`. */
function usagesByOriginal(
  chunk: ModuleUsages,
  map: OutputSourceMap,
  root: string,
): Map<string, Usage[]> {
  const byFile = new Map<string, Usage[]>();
  for (const usage of chunk.usages) {
    const original = map.original(usage.location);
    const file = original === undefined ? '' : toPosix(path.relative(root, original.file));
    const mapped =
      original === undefined
        ? usage
        : { ...usage, location: { file, line: original.line, column: original.column } };
    byFile.set(file, [...(byFile.get(file) ?? []), mapped]);
  }
  return byFile;
}

/**
 * Attributes the usages found in built chunks to the original files and packages their
 * sourcemaps name, and reports the unenv polyfills the build bundled as mocked.
 */
export function attributeOutput(chunks: readonly ModuleUsages[], root: string): AttributedModules {
  const packages = new PackageResolver(root);
  const unenvFiles = new Set<string>();
  let unmapped = 0;

  const originalModule = (chunk: ModuleUsages, file: string, usages: Usage[]): ModuleUsages => {
    const owner = packages.packageFor(file);
    return { file, package: owner, chain: withOwner(chunk.chain, owner?.name ?? file), usages };
  };

  const unenvModules = (chunk: ModuleUsages, map: OutputSourceMap): ModuleUsages[] =>
    map.sources.flatMap(source => {
      const file = toPosix(path.relative(root, source));
      const usage = unenvFiles.has(file) ? undefined : unenvUsage(file);
      unenvFiles.add(file);
      return usage === undefined ? [] : [originalModule(chunk, file, [usage])];
    });

  const modules = chunks.flatMap(chunk => {
    const map = OutputSourceMap.read(path.resolve(root, chunk.file));
    if ((map === undefined || map.dropsMappings) && chunk.usages.length > 0) {
      unmapped += 1;
    }
    if (map === undefined) {
      return [chunk];
    }
    const byFile = usagesByOriginal(chunk, map, root);
    const inChunk = byFile.get('') ?? [];
    byFile.delete('');
    return [
      { ...chunk, usages: inChunk },
      ...[...byFile].map(([file, usages]) => originalModule(chunk, file, usages)),
      ...unenvModules(chunk, map),
    ];
  });
  return { modules, notes: unmapped > 0 ? [unmappedNote(unmapped)] : [] };
}
