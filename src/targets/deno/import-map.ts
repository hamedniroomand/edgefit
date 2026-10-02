import path from 'node:path';

export interface ImportMap {
  imports: Record<string, string>;
  /** Relative targets in the map resolve against this directory. */
  directory: string;
}

const packageSchemes = ['npm:', 'jsr:'];

function isPackageSpecifier(value: string): boolean {
  return packageSchemes.some(scheme => value.startsWith(scheme));
}

export function isPathSpecifier(value: string): boolean {
  return value.startsWith('./') || value.startsWith('../') || value.startsWith('/');
}

/**
 * The longest key that maps this specifier. Keys ending in `/` map every path below them,
 * and, like Deno, so do keys that map to an `npm:` or `jsr:` package.
 */
function matchingKey(specifier: string, imports: Record<string, string>): string | undefined {
  if (Object.hasOwn(imports, specifier)) {
    return specifier;
  }
  return Object.keys(imports)
    .filter(key =>
      key.endsWith('/')
        ? specifier.startsWith(key)
        : isPackageSpecifier(imports[key] ?? '') && specifier.startsWith(`${key}/`),
    )
    .toSorted((left, right) => right.length - left.length)[0];
}

/** Applies an import map, or returns `undefined` when no entry maps the specifier. */
export function applyImportMap(specifier: string, map: ImportMap): string | undefined {
  const key = matchingKey(specifier, map.imports);
  if (key === undefined) {
    return undefined;
  }
  const mapped = `${map.imports[key]}${specifier.slice(key.length)}`;
  return isPathSpecifier(mapped) ? path.resolve(map.directory, mapped) : mapped;
}

/** `npm:@scope/name@^1.2/sub` as the bare specifier `@scope/name/sub`. */
export function npmSpecifier(specifier: string): string | undefined {
  const match = /^npm:\/?((?:@[^/]+\/)?[^@/]+)(?:@[^/]*)?(\/.*)?$/u.exec(specifier);
  return match === null ? undefined : `${match[1]}${match[2] ?? ''}`;
}

/** `jsr:@scope/name@^1.2/sub` as the package `@scope/name` and the export key `./sub`. */
export function jsrSpecifier(specifier: string): { name: string; key: string } | undefined {
  const match = /^jsr:\/?(@[^/]+\/[^/@]+)(?:@[^/]*)?(\/.*)?$/u.exec(specifier);
  const name = match?.[1];
  return name === undefined ? undefined : { name, key: `.${match?.[2] ?? ''}` };
}
