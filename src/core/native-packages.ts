import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { GraphModule } from '@/resolve/graph.ts';

const nativeScripts = /node-gyp|prebuild-install|node-pre-gyp|node-gyp-build|cargo-cp-artifact/u;
const loaderPackages = new Set([
  'bindings',
  'node-gyp-build',
  'node-addon-api',
  '@neon-rs/load',
  '@mapbox/node-pre-gyp',
]);
const platformPackage = /-(?:darwin|linux|win32|freebsd|android)-(?:x64|arm64|arm|ia32|riscv64)/u;

type Manifest = {
  name?: unknown;
  gypfile?: unknown;
  binary?: unknown;
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
};

/** Whether a directory holds a `.node` file, at most two levels down. */
function shipsAddon(directory: string, depth = 0): boolean {
  if (!existsSync(directory)) {
    return false;
  }
  return readdirSync(directory, { withFileTypes: true }).some(entry =>
    entry.isDirectory()
      ? depth < 2 && shipsAddon(path.join(directory, entry.name), depth + 1)
      : entry.name.endsWith('.node'),
  );
}

/** Whether the package has an optional platform package installed that ships a `.node` file. */
function hasInstalledPlatformAddon(manifest: Manifest, directory: string): boolean {
  const parent = path.dirname(directory);
  const modules = path.basename(parent).startsWith('@') ? path.dirname(parent) : parent;
  return Object.keys(manifest.optionalDependencies ?? {})
    .filter(name => platformPackage.test(name))
    .some(name => shipsAddon(path.join(modules, name)));
}

/** The directory of the package that owns a file: the one under the last `node_modules`. */
function packageDirectory(root: string, file: string): string | undefined {
  const absolute = path.resolve(root, file);
  const marker = `${path.sep}node_modules${path.sep}`;
  const start = absolute.lastIndexOf(marker);
  if (start < 0) {
    return undefined;
  }
  const modules = absolute.slice(0, start + marker.length);
  const [first = '', second = ''] = absolute.slice(modules.length).split(path.sep);
  return path.join(modules, first.startsWith('@') ? path.join(first, second) : first);
}

/**
 * Finds the packages that load a native addon through a loader, which edgefit does not follow:
 * `node-gyp-build`, `bindings`, `node-pre-gyp` and the platform packages that ship a `.node` file.
 * An import of such a package counts as an import of a native addon.
 */
export class NativePackages {
  readonly #root: string;
  readonly #manifests = new Map<string, Manifest | undefined>();
  readonly #finders = new Set<string>();

  public constructor(root: string) {
    this.#root = root;
  }

  /** Sets the files that find a module with a computed `require`, see `isNative`. */
  public findBy(files: Iterable<string>): void {
    this.#finders.clear();
    for (const file of files) {
      const directory = packageDirectory(this.#root, file);
      if (directory !== undefined) {
        this.#finders.add(directory);
      }
    }
  }

  /** Whether a file belongs to a native package or to a loader of one. */
  public covers(file: string): boolean {
    const directory = packageDirectory(this.#root, file);
    return directory !== undefined && this.#isNative(directory, true);
  }

  /** The imports of a module that cross into a native package or a `.node` file, by specifier, with the name to show. */
  public specifiers(file: string, module: GraphModule): Map<string, string> {
    const own = packageDirectory(this.#root, file);
    const found = new Map<string, string>();
    for (const link of module.links) {
      const directory = packageDirectory(this.#root, link.path);
      if (link.original === undefined) {
        continue;
      }
      if (link.path.endsWith('.node')) {
        found.set(link.original, link.original.split('/').at(-1) ?? link.original);
      } else if (directory !== undefined && directory !== own && this.#isNative(directory, false)) {
        found.set(link.original, this.#name(directory));
      }
    }
    return found;
  }

  #manifest(directory: string): Manifest | undefined {
    if (!this.#manifests.has(directory)) {
      try {
        this.#manifests.set(
          directory,
          JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as Manifest,
        );
      } catch {
        this.#manifests.set(directory, undefined);
      }
    }
    return this.#manifests.get(directory);
  }

  #name(directory: string): string {
    const name = this.#manifest(directory)?.name;
    return typeof name === 'string' ? name : path.basename(directory);
  }

  /**
   * Whether a manifest says the package loads a native addon. A loader counts only for the files
   * (`loaders`) that cover. A platform package only counts when the package finds it with a computed
   * `require`: `next` lists such packages for its build tools.
   */
  #isNative(directory: string, loaders: boolean): boolean {
    const manifest = this.#manifest(directory);
    if (manifest === undefined) {
      return false;
    }
    const install = [manifest.scripts?.install, manifest.scripts?.postinstall];
    return (
      (loaders && loaderPackages.has(this.#name(directory))) ||
      manifest.gypfile === true ||
      manifest.binary !== undefined ||
      install.some(script => typeof script === 'string' && nativeScripts.test(script)) ||
      Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }).some(name =>
        loaderPackages.has(name),
      ) ||
      (this.#finders.has(directory) && hasInstalledPlatformAddon(manifest, directory))
    );
  }
}
