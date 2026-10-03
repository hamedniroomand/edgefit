import { readFileSync } from 'node:fs';
import path from 'node:path';

import { extractModule, isTypeScript } from '@/extract/index.ts';
import type { ModuleGraph } from '@/resolve/graph.ts';
import { PackageResolver } from '@/resolve/packages.ts';
import { keepsUnusedImports } from '@/resolve/tsconfig.ts';
import { reachedUsages } from '@/trace/reach.ts';

import { ImportChains } from './chains.ts';
import type { ModuleUsages } from './findings.ts';
import { uncheckedImports } from './unchecked-imports.ts';

// esbuild's metafile also lists JSON and asset inputs, which hold no code.
const scriptFile = /\.[cm]?[jt]sx?$/u;

// A package ships its own build settings, so the project's `tsconfig.json` does not apply to it.
function isProjectScript(file: string): boolean {
  return isTypeScript(file) && !file.includes('node_modules');
}

export function toPosix(file: string): string {
  return file.split(path.sep).join('/');
}

export interface ScanOptions {
  /**
   * Leave out what only unused exports use. Build output has been through that already,
   * and its exports are not the ones the source names.
   */
  trace: boolean;
  /** The target's platform stubs out a Node.js module it lacks, so only reading from one fails. */
  lazyNodeImports?: boolean;
  nodeEnv: string | undefined;
}

/** Extracts runtime API usages from every script in the graph, with its package and import chain. */
export function scanModules(
  graph: ModuleGraph,
  root: string,
  globals: ReadonlySet<string>,
  options: ScanOptions,
): ModuleUsages[] {
  const packages = new PackageResolver(root);
  const tsconfigs = new Map<string, boolean>();
  const chains = new ImportChains(graph, packages);
  const scripts = [...graph.modules]
    .filter(([file]) => scriptFile.test(file))
    .map(([file, module]) => {
      const source = readFileSync(path.resolve(root, file), 'utf8');
      const posixFile = toPosix(file);
      return {
        file,
        found: extractModule(posixFile, source, {
          globals,
          shape: options.trace,
          lazyNodeImports: options.lazyNodeImports,
          keepUnusedImports:
            isProjectScript(file) && keepsUnusedImports(path.resolve(root, file), root, tsconfigs),
          nodeEnv: options.nodeEnv,
          nativeSpecifiers: new Set(
            module.links
              .filter(link => link.path.endsWith('.node'))
              .flatMap(link => link.original ?? []),
          ),
        }),
        unchecked: uncheckedImports(posixFile, source, module.externals, module.missingPeers),
      };
    });
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
