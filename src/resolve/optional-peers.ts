import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { Message, Plugin } from 'esbuild';

/** `react/jsx-runtime` as `react`, and `@scope/pkg/sub` as `@scope/pkg`. */
export function moduleName(specifier: string): string {
  return specifier.split('/', specifier.startsWith('@') ? 2 : 1).join('/');
}

/** Names one import of one module. The importer is an absolute path. */
export function importKey(importer: string, specifier: string): string {
  return `${importer}\0${specifier}`;
}

/**
 * The optional peer dependencies of the nearest named package.json above a file. A nested
 * manifest such as `esm/package.json` holds only `type` and is skipped.
 */
function optionalPeersOf(file: string): ReadonlySet<string> {
  for (let directory = path.dirname(file); ; directory = path.dirname(directory)) {
    const manifest = path.join(directory, 'package.json');
    const found = existsSync(manifest)
      ? (JSON.parse(readFileSync(manifest, 'utf8')) as {
          name?: unknown;
          peerDependenciesMeta?: Record<string, { optional?: boolean } | undefined>;
        })
      : undefined;
    if (typeof found?.name === 'string') {
      const { peerDependenciesMeta } = found;
      return new Set(
        Object.entries(peerDependenciesMeta ?? {})
          .filter(([, meta]) => meta?.optional === true)
          .map(([name]) => name),
      );
    }
    if (path.dirname(directory) === directory) {
      return new Set();
    }
  }
}

/**
 * Adds the failed imports that name an optional peer dependency of the importing package to
 * `accepted`. The user brings the peer, so its version is not known. Returns true when it added a new one.
 */
export function acceptMissingPeers(
  root: string,
  messages: readonly Message[],
  accepted: Set<string>,
): boolean {
  let added = false;
  for (const { location, text } of messages) {
    const specifier = /^Could not resolve "([^"]+)"/u.exec(text)?.[1];
    if (specifier === undefined || location === null) {
      continue;
    }
    const importer = path.resolve(root, location.file);
    if (
      importer.split(path.sep).includes('node_modules') &&
      optionalPeersOf(importer).has(moduleName(specifier))
    ) {
      const key = importKey(importer, specifier);
      added ||= !accepted.has(key);
      accepted.add(key);
    }
  }
  return added;
}

/** Keeps the accepted imports out of the graph. */
export function optionalPeers(accepted: ReadonlySet<string>): Plugin {
  return {
    name: 'edgefit-optional-peers',
    setup(build) {
      // esbuild compiles filters as Go regular expressions, which reject the `u` flag.
      // oxlint-disable-next-line require-unicode-regexp
      build.onResolve({ filter: /.*/ }, args =>
        accepted.has(importKey(args.importer, args.path))
          ? { path: args.path, external: true }
          : undefined,
      );
    },
  };
}
