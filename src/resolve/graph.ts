import path from 'node:path';

import { build } from 'esbuild';
import type { Loader, Message, Metafile, Plugin } from 'esbuild';

import { toResolveError } from './errors.ts';
import { acceptMissingPeers, importKey, optionalPeers } from './optional-peers.ts';
import { runtimeExternals } from './runtime-externals.ts';

/** An import of a module in the graph, as esbuild resolved it. */
export interface ImportLink {
  /** The imported module, as a key of `ModuleGraph.modules`. */
  path: string;
  /** The specifier as written in the source, when esbuild kept it. */
  original: string | undefined;
  /** esbuild's kind: `import-statement`, `dynamic-import`, `require-call`, and others. */
  kind: string;
}

export interface GraphModule {
  imports: string[];
  links: ImportLink[];
  /** Imports left out of the graph, such as `node:fs` or `jsr:@std/path@^1`. */
  externals: string[];
  /** The externals that are optional peer dependencies which are not installed. */
  missingPeers: string[];
}

export interface ModuleGraph {
  /** The entries, as keys of `modules`. */
  entries: string[];
  /** Modules reached from the entry, keyed by path relative to the project root. */
  modules: Map<string, GraphModule>;
}

export interface ResolveOptions {
  root: string;
  /** One or more entries, relative to the root. Each one is bundled as its own entry point. */
  entries: readonly string[];
  conditions: readonly string[];
  platform: 'browser' | 'node';
  /** What `process.env.NODE_ENV` is replaced with, so an import in a removed branch is not followed. */
  nodeEnv: string | undefined;
  /** Target resolvers that run before edgefit's own. */
  plugins?: readonly Plugin[];
}

const mainFields = {
  browser: ['browser', 'module', 'main'],
  node: ['module', 'main'],
};

const assetExtensions = [
  '.wasm',
  '.bin',
  '.txt',
  '.html',
  '.sql',
  '.css',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
];

// Assets can be imported but hold no code to scan.
const assetLoaders: Record<string, Loader> = Object.fromEntries(
  assetExtensions.map(extension => [extension, 'empty']),
);

function isBuildFailure(error: unknown): error is { errors: Message[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'errors' in error &&
    Array.isArray(error.errors) &&
    error.errors.length > 0
  );
}

async function bundleMetafile(options: ResolveOptions, accepted: Set<string>): Promise<Metafile> {
  const define: Record<string, string> = {};
  if (options.nodeEnv !== undefined) {
    define['process.env.NODE_ENV'] = JSON.stringify(options.nodeEnv);
  }
  try {
    const result = await build({
      absWorkingDir: options.root,
      entryPoints: [...new Set(options.entries)],
      bundle: true,
      write: false,
      metafile: true,
      outdir: 'edgefit-out',
      // Two entries named `index.ts` in different directories must not clash on one output file.
      entryNames: '[dir]/[name]-[hash]',
      platform: options.platform,
      format: 'esm',
      conditions: [...options.conditions],
      mainFields: mainFields[options.platform],
      loader: assetLoaders,
      define,
      logLevel: 'silent',
      plugins: [...(options.plugins ?? []), runtimeExternals, optionalPeers(accepted)],
    });
    return result.metafile;
  } catch (error) {
    if (isBuildFailure(error) && acceptMissingPeers(options.root, error.errors, accepted)) {
      return bundleMetafile(options, accepted);
    }
    throw isBuildFailure(error) ? toResolveError(error.errors) : error;
  }
}

/** Resolves the module graph from an entry the way the target's bundler would. */
export async function resolveGraph(options: ResolveOptions): Promise<ModuleGraph> {
  const accepted = new Set<string>();
  const metafile = await bundleMetafile(options, accepted);
  const modules = new Map<string, GraphModule>();
  for (const [file, input] of Object.entries(metafile.inputs)) {
    const internal = input.imports.filter(item => item.external !== true);
    const imports = internal.map(item => item.path);
    const links = internal.map(item => ({
      path: item.path,
      original: item.original,
      kind: item.kind,
    }));
    const externals = input.imports.filter(item => item.external === true).map(item => item.path);
    modules.set(file, {
      imports,
      links,
      externals,
      missingPeers: externals.filter(item =>
        accepted.has(importKey(path.resolve(options.root, file), item)),
      ),
    });
  }
  const entries = Object.values(metafile.outputs).flatMap(output => output.entryPoint ?? []);
  return { entries: [...new Set(entries)], modules };
}
