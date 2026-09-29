import type { OnResolveArgs, OnResolveResult, Plugin } from 'esbuild';

import { builtinName } from '@/data/builtins.ts';

function isRuntimeModule(specifier: string): boolean {
  return (
    builtinName(specifier) !== undefined ||
    specifier.startsWith('node:') ||
    specifier.startsWith('cloudflare:') ||
    specifier === 'bun' ||
    specifier.startsWith('bun:')
  );
}

function resolveRuntimeModule(args: OnResolveArgs): OnResolveResult | undefined {
  if (args.kind === 'entry-point' || !isRuntimeModule(args.path)) {
    return undefined;
  }
  return { path: args.path, external: true };
}

/** Keeps modules the runtime provides (Node built-ins, `cloudflare:*`, `bun`) out of the graph. */
export const runtimeExternals: Plugin = {
  name: 'edgefit-runtime-externals',
  setup(build) {
    // esbuild compiles filters as Go regular expressions, which reject the `u` flag.
    // oxlint-disable-next-line require-unicode-regexp
    build.onResolve({ filter: /.*/ }, resolveRuntimeModule);
  },
};
