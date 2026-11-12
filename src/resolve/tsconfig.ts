import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { parseJSONC } from 'confbox';
import { transform } from 'esbuild';
import type { Plugin } from 'esbuild';

import { isTypeScript } from '@/extract/index.ts';

interface TsConfig {
  extends?: unknown;
  compilerOptions?: Record<string, unknown>;
}

function readConfig(file: string): TsConfig {
  // A tsconfig that does not parse is left to the bundler to report.
  try {
    const config: unknown = parseJSONC(readFileSync(file, 'utf8'), { allowTrailingComma: true });
    return typeof config === 'object' && config !== null ? config : {};
  } catch {
    return {};
  }
}

function keeps(options: Record<string, unknown>): boolean {
  const unused = options.importsNotUsedAsValues;
  return (
    options.verbatimModuleSyntax === true ||
    options.preserveValueImports === true ||
    unused === 'preserve' ||
    unused === 'error'
  );
}

function configFile(from: string, name: string): string | undefined {
  const parent = path.resolve(path.dirname(from), name);
  return [parent, `${parent}.json`].find(file => existsSync(file) && statSync(file).isFile());
}

/** The resolve errors that mean no base config: the package or file is missing, or the `exports` of the package do not list the file. */
const notFound = new Set(['MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED']);

/**
 * The base config that a package name in `extends` names, found as a module from the config, as
 * TypeScript does. A file comes before a folder, and a folder gives its `tsconfig.json`. The name
 * alone comes last, for an `exports` entry that names the config without `.json`, such as `.` or
 * `./tsc/dom/app`. In a package with no `tsconfig.json`, it can give a JSON `main` or `index.json`
 * that the bundler does not read. `directoryKeeps` stops such a file from removing an import that
 * the relative bases keep.
 * ponytail: the package.json `tsconfig` field and package `imports` (`#name`) are not read, and
 * the `exports` conditions of Node.js (`require`, `node`, `default`) replace those of TypeScript
 * and esbuild. Upgrade by reading them as the bundler does.
 */
function packageConfig(from: string, name: string): string | undefined {
  const require = createRequire(from);
  const first = name.endsWith('.json') ? [name] : [];
  for (const request of [...first, `${name}.json`, `${name}/tsconfig.json`, name]) {
    try {
      const file = require.resolve(request);
      // A package `main` can be a script. Only a `.json` file is a config.
      if (file.endsWith('.json')) {
        return file;
      }
    } catch (error) {
      if (!notFound.has(String((error as NodeJS.ErrnoException).code))) {
        throw error;
      }
    }
  }
  return undefined;
}

/**
 * The compiler options of a config, each one set by the config that is nearest to the file. `seen`
 * holds the configs that extend this one, so a loop ends. Without `packages`, only an `extends`
 * that starts with `.` is followed.
 */
function compilerOptions(
  file: string,
  seen: Set<string>,
  packages: boolean,
): Record<string, unknown> {
  if (seen.has(file)) {
    return {};
  }
  const chain = new Set(seen).add(file);
  const config = readConfig(file);
  // An empty name would make `packageConfig` read `/tsconfig.json` at the file system root. A
  // `#name` is a package import, which is not read.
  const parents = (Array.isArray(config.extends) ? config.extends : [config.extends]).filter(
    (name): name is string =>
      typeof name === 'string' &&
      (name.startsWith('.') || (packages && name !== '' && !name.startsWith('#'))),
  );
  const inherited = parents.map(name => {
    const parent =
      name.startsWith('.') || path.isAbsolute(name)
        ? configFile(file, name)
        : packageConfig(file, name);
    return parent === undefined ? {} : compilerOptions(parent, chain, packages);
  });
  // The last config in a list wins.
  return Object.assign({}, ...(inherited as object[]), config.compilerOptions) as Record<
    string,
    unknown
  >;
}

function directoryKeeps(directory: string, root: string, cache: Map<string, boolean>): boolean {
  const cached = cache.get(directory);
  if (cached !== undefined) {
    return cached;
  }
  const config = path.join(directory, 'tsconfig.json');
  const up = path.dirname(directory);
  let result = false;
  if (existsSync(config)) {
    // A base from a package or an absolute path, which edgefit did not read before, can only add
    // kept imports. It must not remove an import that the relative bases keep.
    result =
      keeps(compilerOptions(config, new Set(), false)) ||
      keeps(compilerOptions(config, new Set(), true));
  } else if (directory !== root && up !== directory) {
    result = directoryKeeps(up, root, cache);
  }
  cache.set(directory, result);
  return result;
}

/**
 * Whether a file, relative to the root, is a TypeScript file of the project. A package ships its
 * own build settings, so the project's `tsconfig.json` does not apply to it.
 */
export function isProjectScript(file: string): boolean {
  return isTypeScript(file) && !file.includes('node_modules');
}

/**
 * Whether the bundler keeps an import that nothing uses as a value. It reads the nearest
 * `tsconfig.json` from the file up to `root`. A config above the root is not read, because the
 * platform does not read it. Pass one `cache` to many calls to read each directory once.
 */
export function keepsUnusedImports(
  file: string,
  root: string,
  cache = new Map<string, boolean>(),
): boolean {
  return directoryKeeps(path.dirname(file), root, cache);
}

/**
 * Settings that stop esbuild from reading a `tsconfig.json` above the root. They apply when the
 * root has no config and a directory above it has one.
 */
export function tsconfigRawFor(root: string): string | undefined {
  if (existsSync(path.join(root, 'tsconfig.json'))) {
    return undefined;
  }
  for (let directory = path.dirname(root); ; directory = path.dirname(directory)) {
    if (existsSync(path.join(directory, 'tsconfig.json'))) {
      // ponytail: this also hides a config below the root. `nestedTsconfigs` gives back the
      // imports that such a config keeps, but its `paths`, `baseUrl` and JSX options stay lost.
      // Upgrade with a resolve plugin that reads them.
      return '{}';
    }
    if (directory === path.dirname(directory)) {
      return undefined;
    }
  }
}

/**
 * When `tsconfigRawFor` hides every config, this keeps the imports that a `tsconfig.json` below
 * the root keeps. It reads the configs as `keepsUnusedImports` does. `preserveValueImports` drops
 * `import { type A } from 'a'`, but this keeps it as `import 'a'`, which can only add a module.
 * ponytail: a file that `importWrappers` or `mainOnly` changes keeps their output, and esbuild then
 * drops its unused imports. A file outside the root, such as a package beside the project, gets no
 * config. Upgrade by running this step in those plugins too, and by reading the config of a file
 * outside the root when that config is not above the root.
 */
export const nestedTsconfigs = (root: string): Plugin => ({
  name: 'edgefit-nested-tsconfigs',
  setup(build) {
    if (tsconfigRawFor(root) === undefined) {
      return;
    }
    const cache = new Map<string, boolean>();
    // esbuild compiles filters as Go regular expressions, which reject the `u` flag.
    // oxlint-disable-next-line require-unicode-regexp
    build.onLoad({ filter: /\.[cm]?tsx?$/, namespace: 'file' }, async args => {
      const file = path.relative(root, args.path);
      // For a file outside the root, `keepsUnusedImports` goes past the root and can read a
      // config above it.
      if (
        file.startsWith(`..${path.sep}`) ||
        !isProjectScript(file) ||
        !keepsUnusedImports(args.path, root, cache)
      ) {
        return;
      }
      try {
        // `preserve` writes an import with no value use as `import 'a'`, which the `ts` loader
        // keeps. With a `js` loader, an import of a type by name fails.
        const { code } = await transform(readFileSync(args.path, 'utf8'), {
          loader: args.path.endsWith('x') ? 'tsx' : 'ts',
          sourcefile: args.path,
          tsconfigRaw: { compilerOptions: { importsNotUsedAsValues: 'preserve' } },
        });
        return { contents: code, loader: 'ts', resolveDir: path.dirname(args.path) };
      } catch {
        // The bundler then reads the file itself and reports why it does not parse.
      }
    });
  },
});
