import path from 'node:path';

import type { Plugin } from 'esbuild';

import { importWrappers } from './import-wrappers.ts';
import { mainOnly } from './main-only.ts';
import { optionalPeers } from './optional-peers.ts';
import { runtimeExternals } from './runtime-externals.ts';

/** The esbuild plugins of a graph build: the target's own resolvers run first. */
export function graphPlugins(
  options: { root: string; entries: readonly string[]; plugins?: readonly Plugin[] },
  missing: Set<string>,
): Plugin[] {
  return [
    ...(options.plugins ?? []),
    runtimeExternals,
    importWrappers,
    mainOnly(new Set(options.entries.map(entry => path.resolve(options.root, entry)))),
    optionalPeers(missing),
  ];
}
