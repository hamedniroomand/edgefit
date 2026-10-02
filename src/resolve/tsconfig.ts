import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'jsonc-parser';

interface TsConfig {
  extends?: unknown;
  compilerOptions?: Record<string, unknown>;
}

function readConfig(file: string): TsConfig {
  // A tsconfig that does not parse is left to the bundler to report.
  const config: unknown = parse(readFileSync(file, 'utf8'), [], { allowTrailingComma: true });
  return typeof config === 'object' && config !== null ? config : {};
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

/** The compiler options of a config, each one set by the config that is nearest to the file. `seen` holds the configs that extend this one, so a loop ends. */
function compilerOptions(file: string, seen: Set<string>): Record<string, unknown> {
  if (seen.has(file)) {
    return {};
  }
  const chain = new Set(seen).add(file);
  const config = readConfig(file);
  // ponytail: a package name in `extends` is not followed. Resolve it with `createRequire` to cover it.
  const parents = (Array.isArray(config.extends) ? config.extends : [config.extends]).filter(
    (name): name is string => typeof name === 'string' && name.startsWith('.'),
  );
  const inherited = parents.map(name => {
    const parent = configFile(file, name);
    return parent === undefined ? {} : compilerOptions(parent, chain);
  });
  // The last config in a list wins.
  return Object.assign({}, ...(inherited as object[]), config.compilerOptions) as Record<
    string,
    unknown
  >;
}

function directoryKeeps(directory: string, cache: Map<string, boolean>): boolean {
  const cached = cache.get(directory);
  if (cached !== undefined) {
    return cached;
  }
  const config = path.join(directory, 'tsconfig.json');
  const up = path.dirname(directory);
  let result = false;
  if (existsSync(config)) {
    result = keeps(compilerOptions(config, new Set()));
  } else if (up !== directory) {
    result = directoryKeeps(up, cache);
  }
  cache.set(directory, result);
  return result;
}

/**
 * Whether the bundler keeps an import that nothing uses as a value. It reads the nearest
 * `tsconfig.json`, as esbuild does. Pass one `cache` to many calls to read each directory once.
 */
export function keepsUnusedImports(file: string, cache = new Map<string, boolean>()): boolean {
  return directoryKeeps(path.dirname(file), cache);
}
