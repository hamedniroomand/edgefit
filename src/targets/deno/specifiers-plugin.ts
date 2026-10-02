import path from 'node:path';

import type { OnResolveArgs, OnResolveResult, Plugin, PluginBuild } from 'esbuild';

import type { WorkspaceMember } from './deno-config.ts';
import { applyImportMap, jsrSpecifier, npmSpecifier } from './import-map.ts';
import type { ImportMap } from './import-map.ts';

// Marks the plugin's own `build.resolve` calls so it does not map a specifier twice.
const remapped = Symbol('edgefit-deno-remapped');

/** Deno applies the import map to the project's own code; npm packages resolve the Node way. */
function isProjectImport(args: OnResolveArgs): boolean {
  return !args.importer.split(/[/\\]/u).includes('node_modules');
}

/** Deno reads the import map of the workspace member that holds the importing file. */
function importMapFor(
  importer: string,
  importMap: ImportMap | undefined,
  members: readonly WorkspaceMember[],
): ImportMap | undefined {
  const [member] = members
    .filter(item => {
      const relative = path.relative(item.directory, importer);
      return !relative.startsWith('..') && !path.isAbsolute(relative);
    })
    .toSorted((left, right) => right.directory.length - left.directory.length);
  return member === undefined ? importMap : member.importMap;
}

/**
 * The file a `jsr:` specifier names, when it names a member of the workspace.
 * ponytail: the version range is not checked. Deno uses the registry when the member does not
 * satisfy it. Upgrade with a semver check.
 */
function workspaceFile(specifier: string, members: readonly WorkspaceMember[]): string | undefined {
  const parsed = jsrSpecifier(specifier);
  const member = members.find(item => item.name === parsed?.name);
  const target = member?.exports[parsed?.key ?? ''];
  return member === undefined || target === undefined
    ? undefined
    : path.resolve(member.directory, target);
}

function denoResolver(
  build: PluginBuild,
  importMap: ImportMap | undefined,
  members: readonly WorkspaceMember[],
): (args: OnResolveArgs) => Promise<OnResolveResult | undefined> {
  return async args => {
    if (args.pluginData === remapped || args.kind === 'entry-point') {
      return;
    }
    const map = importMapFor(args.importer, importMap, members);
    const mapped =
      map !== undefined && isProjectImport(args) ? applyImportMap(args.path, map) : undefined;
    const specifier = mapped ?? args.path;
    if (specifier.startsWith('jsr:')) {
      const file = workspaceFile(specifier, members);
      return file === undefined ? { path: specifier, external: true } : { path: file };
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
 * `pkg`, follows `jsr:` packages of the workspace, and leaves other `jsr:` packages out of the graph.
 */
export function denoSpecifiers(
  importMap: ImportMap | undefined,
  members: readonly WorkspaceMember[] = [],
): Plugin {
  return {
    name: 'edgefit-deno-specifiers',
    setup(build) {
      // esbuild compiles filters as Go regular expressions, which reject the `u` flag.
      // oxlint-disable-next-line require-unicode-regexp
      build.onResolve({ filter: /.*/ }, denoResolver(build, importMap, members));
    },
  };
}
