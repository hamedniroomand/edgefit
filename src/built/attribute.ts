import { existsSync } from 'node:fs';
import path from 'node:path';

import type { ModuleUsages } from '@/core/findings.ts';
import { toPosix } from '@/core/scan.ts';
import { PackageResolver } from '@/resolve/packages.ts';
import type { Usage } from '@/types.ts';

import { readRegions } from './regions.ts';
import type { Regions } from './regions.ts';
import { OutputSourceMap } from './source-map.ts';
import { unenvUsage } from './unenv.ts';

export interface AttributedModules {
  modules: ModuleUsages[];
  notes: string[];
}

function unmappedNote(count: number): string {
  const files = count === 1 ? '1 output file has' : `${count} output files have`;
  return (
    `${files} no sourcemap mappings, so their findings point into the build output, and packages are read from its region markers where it has them. ` +
    'Build with `sourcemap: true` (Nitro also needs `experimental.sourcemapMinify: false`) ' +
    'to report the original files and lines.'
  );
}

/** Folders that frameworks and platforms write their build to. */
const generatedFolder = /^\.(?:svelte-kit|next|nuxt|output|vercel|netlify|astro)\//u;

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
 * Splits a chunk's usages by the module region they sit in. The locations stay in the output,
 * because a region names the original file but the line inside it is not known.
 */
function usagesByRegion(chunk: ModuleUsages, regions: Regions): Map<string, Usage[]> {
  const byFile = new Map<string, Usage[]>();
  for (const usage of chunk.usages) {
    const file = regions.fileAt(usage.location.line) ?? '';
    byFile.set(file, [...(byFile.get(file) ?? []), usage]);
  }
  return byFile;
}

/** The chunk's own leftovers (under `''`) followed by one module per original file. */
function splitChunk(
  chunk: ModuleUsages,
  byFile: Map<string, Usage[]>,
  moduleFor: (file: string, usages: Usage[]) => ModuleUsages,
): ModuleUsages[] {
  const inChunk = byFile.get('') ?? [];
  byFile.delete('');
  return [
    { ...chunk, buildOutput: true, usages: inChunk },
    ...[...byFile].map(([file, usages]) => moduleFor(file, usages)),
  ];
}

/** A module for an original file: owned by its package, the project's own, or build output. */
function moduleOf(
  packages: PackageResolver,
  root: string,
  chunk: ModuleUsages,
  file: string,
  usages: Usage[],
): ModuleUsages {
  const owner = packages.packageFor(file);
  // Code the bundler added has no original file in the project: it is not the project's own. Nor
  // is a file in a folder a framework generates, which is an earlier stage of the same build.
  const own =
    owner === undefined && !generatedFolder.test(file) && existsSync(path.join(root, file));
  return {
    file,
    package: owner,
    ...(owner === undefined && !own ? { buildOutput: true as const } : {}),
    chain: withOwner(chunk.chain, owner?.name ?? file),
    usages,
  };
}

/**
 * Attributes the usages found in built chunks to the original files and packages their
 * sourcemaps name, and reports the unenv polyfills the build bundled as mocked.
 */
export function attributeOutput(chunks: readonly ModuleUsages[], root: string): AttributedModules {
  const packages = new PackageResolver(root);
  const unenvFiles = new Set<string>();
  let unmapped = 0;

  const originalModule = (chunk: ModuleUsages, file: string, usages: Usage[]): ModuleUsages =>
    moduleOf(packages, root, chunk, file, usages);

  const unenvModules = (chunk: ModuleUsages, map: OutputSourceMap): ModuleUsages[] =>
    map.sources.flatMap(source => {
      const file = toPosix(path.relative(root, source));
      const usage = unenvFiles.has(file) ? undefined : unenvUsage(file);
      unenvFiles.add(file);
      return usage === undefined ? [] : [originalModule(chunk, file, [usage])];
    });

  const regionModules = (chunk: ModuleUsages): ModuleUsages[] => {
    const regions = readRegions(path.resolve(root, chunk.file));
    return regions === undefined
      ? [{ ...chunk, buildOutput: true as const }]
      : splitChunk(chunk, usagesByRegion(chunk, regions), (file, usages) =>
          originalModule(chunk, file, usages),
        );
  };

  const modules = chunks.flatMap(chunk => {
    const map = OutputSourceMap.read(path.resolve(root, chunk.file), root);
    if ((map === undefined || map.dropsMappings) && chunk.usages.length > 0) {
      unmapped += 1;
    }
    if (map === undefined) {
      return regionModules(chunk);
    }
    return [
      ...splitChunk(chunk, usagesByOriginal(chunk, map, root), (file, usages) =>
        originalModule(chunk, file, usages),
      ),
      ...unenvModules(chunk, map),
    ];
  });
  return { modules, notes: unmapped > 0 ? [unmappedNote(unmapped)] : [] };
}
