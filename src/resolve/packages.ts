import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { PackageInfo } from '@/types.ts';

/** `node_modules/@scope/name/dist/index.js` as `@scope/name`. */
function nameFromPath(file: string): string | undefined {
  const segments = file.split(path.sep);
  const [first = '', second = ''] = segments.slice(segments.lastIndexOf('node_modules') + 1);
  // A dot folder such as `.cache` or `.vite` is tool output. npm names cannot start with a dot.
  if (first.startsWith('.')) {
    return undefined;
  }
  return first.startsWith('@') ? `${first}/${second}` : first;
}

/**
 * Maps files to the npm package that owns them, using the nearest package.json under node_modules.
 * A file whose package is not installed, as sourcemaps of a build can name, is owned by the package
 * its path names.
 */
export class PackageResolver {
  readonly #root: string;
  readonly #byDirectory = new Map<string, PackageInfo | undefined>();

  public constructor(root: string) {
    this.#root = root;
  }

  /** The package owning a file (relative to the root), or `undefined` for the project's own code. */
  public packageFor(file: string): PackageInfo | undefined {
    const absolute = path.resolve(this.#root, file);
    if (!absolute.split(path.sep).includes('node_modules')) {
      return undefined;
    }
    const owner = this.#lookup(path.dirname(absolute));
    if (owner) {
      return owner;
    }
    const name = nameFromPath(absolute);
    return name === undefined ? undefined : { name, version: undefined };
  }

  #lookup(directory: string): PackageInfo | undefined {
    if (this.#byDirectory.has(directory)) {
      return this.#byDirectory.get(directory);
    }
    let result: PackageInfo | undefined;
    const manifest = path.join(directory, 'package.json');
    const parent = path.dirname(directory);
    if (path.basename(directory) === 'node_modules' || parent === directory) {
      result = undefined;
    } else if (existsSync(manifest)) {
      result = readManifest(manifest) ?? this.#lookup(parent);
    } else {
      result = this.#lookup(parent);
    }
    this.#byDirectory.set(directory, result);
    return result;
  }
}

/** Reads a manifest's name and version. Nested manifests without a name (e.g. `{"type":"module"}`) are skipped. */
function readManifest(file: string): PackageInfo | undefined {
  try {
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
      name?: unknown;
      version?: unknown;
    };
    if (typeof manifest.name !== 'string') {
      return undefined;
    }
    return {
      name: manifest.name,
      version: typeof manifest.version === 'string' ? manifest.version : undefined,
    };
  } catch {
    return undefined;
  }
}

export function formatPackage(info: PackageInfo): string {
  return info.version === undefined ? info.name : `${info.name}@${info.version}`;
}
