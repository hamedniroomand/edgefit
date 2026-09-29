import type { OnResolveArgs, OnResolveResult, Plugin, PluginBuild } from 'esbuild';

import { applyImportMap, npmSpecifier } from './import-map.ts';
import type { ImportMap } from './import-map.ts';

// Marks the plugin's own `build.resolve` calls so it does not map a specifier twice.
const remapped = Symbol('edgefit-deno-remapped');

/** Deno applies the import map to the project's own code; npm packages resolve the Node way. */
function isProjectImport(args: OnResolveArgs): boolean {
  return !args.importer.split(/[/\\]/u).includes('node_modules');
}

function denoResolver(
  build: PluginBuild,
  importMap: ImportMap | undefined,
): (args: OnResolveArgs) => Promise<OnResolveResult | undefined> {
  return async args => {
    if (args.pluginData === remapped || args.kind === 'entry-point') {
      return;
    }
    const mapped =
      importMap !== undefined && isProjectImport(args)
        ? applyImportMap(args.path, importMap)
        : undefined;
    const specifier = mapped ?? args.path;
    if (specifier.startsWith('jsr:')) {
      return { path: specifier, external: true };
    }
    const bare = npmSpecifier(specifier);
    if (bare === undefined && mapped === undefined) {
      return;
    }
    const result = await build.resolve(bare ?? specifier, {
      kind: args.kind,
      importer: args.importer,
      resolveDir: args.resolveDir,
      pluginData: remapped,
    });
    if (result.errors.length > 0) {
      return { errors: result.errors };
    }
    return {
      path: result.path,
      external: result.external,
      namespace: result.namespace,
      sideEffects: result.sideEffects,
      suffix: result.suffix,
    };
  };
}

/**
 * Resolves Deno specifiers before esbuild does: applies the import map, reads `npm:pkg@1` as
 * `pkg`, and leaves `jsr:` packages out of the graph, since edgefit does not fetch them.
 */
export function denoSpecifiers(importMap: ImportMap | undefined): Plugin {
  return {
    name: 'edgefit-deno-specifiers',
    setup(build) {
      // esbuild compiles filters as Go regular expressions, which reject the `u` flag.
      // oxlint-disable-next-line require-unicode-regexp
      build.onResolve({ filter: /.*/ }, denoResolver(build, importMap));
    },
  };
}
