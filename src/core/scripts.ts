import { readFileSync } from 'node:fs';
import path from 'node:path';

import { extractModule, isTypeScript } from '@/extract/index.ts';
import type { ExtractedModule } from '@/extract/index.ts';
import type { GraphModule, ModuleGraph } from '@/resolve/graph.ts';
import { keepsUnusedImports } from '@/resolve/tsconfig.ts';
import type { ApiRef, Usage } from '@/types.ts';

import { dropFollowed, followAliases } from './aliases.ts';
import { uncheckedImports } from './unchecked-imports.ts';

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
  /** Do not report an optional peer dependency that is not installed. The caller lists it instead. */
  leaveOutMissingPeers?: boolean;
}

// esbuild's metafile also lists JSON and asset inputs, which hold no code.
const scriptFile = /\.[cm]?[jt]sx?$/u;

// A package ships its own build settings, so the project's `tsconfig.json` does not apply to it.
function isProjectScript(file: string): boolean {
  return isTypeScript(file) && !file.includes('node_modules');
}

/** The optional peers to report as unknown: none when the caller lists them instead. */
function peers(module: GraphModule, options: ScanOptions): readonly string[] {
  return options.leaveOutMissingPeers === true ? [] : module.missingPeers;
}

export interface Script {
  file: string;
  found: ExtractedModule;
  /** The imports that are not followed, as unknown usages. */
  unchecked: Usage[];
}

/**
 * Extracts every script of the graph. A Node.js module that a file exports under a name is that
 * module in the files that import the name, so those files are extracted again with it.
 */
export function extractScripts(
  graph: ModuleGraph,
  root: string,
  globals: ReadonlySet<string>,
  options: ScanOptions,
): Script[] {
  const tsconfigs = new Map<string, boolean>();
  const extract = (
    file: string,
    module: GraphModule,
    source: string,
    importedModules?: ReadonlyMap<string, ApiRef>,
  ): ExtractedModule =>
    extractModule(toPosix(file), source, {
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
      importedModules,
    });
  const first = [...graph.modules]
    .filter(([file]) => scriptFile.test(file))
    .map(([file, module]) => {
      const source = readFileSync(path.resolve(root, file), 'utf8');
      return { file, module, source, found: extract(file, module, source) };
    });
  const aliases = options.trace
    ? followAliases(graph, new Map(first.map(({ file, found }) => [file, found])))
    : undefined;
  return first.map(({ file, module, source, found }) => {
    const seeds = aliases?.seeds.get(file);
    const second = seeds === undefined ? found : extract(file, module, source, seeds);
    return {
      file,
      found: dropFollowed(second, aliases?.followed.get(file)),
      unchecked: uncheckedImports(toPosix(file), source, module.externals, peers(module, options)),
    };
  });
}
