import { readFileSync } from 'node:fs';
import path from 'node:path';

import { extractUsages } from '@/extract/index.ts';
import type { ModuleGraph } from '@/resolve/graph.ts';
import { PackageResolver } from '@/resolve/packages.ts';

import { ImportChains } from './chains.ts';
import type { ModuleUsages } from './findings.ts';
import { uncheckedImports } from './unchecked-imports.ts';

// esbuild's metafile also lists JSON and asset inputs, which hold no code.
const scriptFile = /\.[cm]?[jt]sx?$/u;

export function toPosix(file: string): string {
  return file.split(path.sep).join('/');
}

/** Extracts runtime API usages from every script in the graph, with its package and import chain. */
export function scanModules(
  graph: ModuleGraph,
  root: string,
  globals: ReadonlySet<string>,
): ModuleUsages[] {
  const packages = new PackageResolver(root);
  const chains = new ImportChains(graph, packages);
  return [...graph.modules]
    .filter(([file]) => scriptFile.test(file))
    .map(([file, module]) => {
      const posixFile = toPosix(file);
      const source = readFileSync(path.resolve(root, file), 'utf8');
      return {
        file,
        package: packages.packageFor(file),
        chain: chains.chainTo(file),
        usages: [
          ...extractUsages(posixFile, source, { globals }),
          ...uncheckedImports(posixFile, source, module.externals),
        ],
      };
    });
}
