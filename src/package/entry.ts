export interface PackageManifest {
  name?: string;
  version?: string;
  main?: string;
  module?: string;
  exports?: unknown;
}

export interface PackageEntry {
  /** The `exports` key: `.` or `./sub`. */
  subpath: string;
  /** What a project writes to import it: `name` or `name/sub`. */
  specifier: string;
}

// Targets that are not code an entry can import.
const nonCodeSuffixes = ['.json', '.css', '.node', '.wasm', '.d.ts', '.d.mts', '.d.cts', '.md'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether a condition tree ends in at least one JavaScript file. `null` blocks the subpath. */
function hasCodeTarget(value: unknown): boolean {
  if (typeof value === 'string') {
    return !nonCodeSuffixes.some(suffix => value.endsWith(suffix));
  }
  if (Array.isArray(value)) {
    return value.some(item => hasCodeTarget(item));
  }
  if (isRecord(value)) {
    return Object.values(value).some(item => hasCodeTarget(item));
  }
  return false;
}

function subpathsOf(exports: unknown): string[] {
  if (isRecord(exports) && Object.keys(exports).some(key => key.startsWith('.'))) {
    return Object.entries(exports)
      .filter(([key, value]) => key.startsWith('.') && hasCodeTarget(value))
      .map(([key]) => key);
  }
  // A string, an array or a bare condition object is the sugar for the "." entry.
  return hasCodeTarget(exports) ? ['.'] : [];
}

/**
 * The public entry points to check. Patterns (`./*`) and `./package.json` are skipped. Without an
 * `exports` field the package is imported through `main` or `module`, or its `index.js`.
 */
export function packageEntries(
  manifest: PackageManifest,
  name: string,
  options: { skip?: readonly string[]; only?: readonly string[] } = {},
): PackageEntry[] {
  const declared =
    manifest.exports === undefined || manifest.exports === null
      ? ['.']
      : subpathsOf(manifest.exports);
  const subpaths = declared.filter(
    subpath =>
      subpath !== './package.json' &&
      !subpath.includes('*') &&
      !(options.skip ?? []).includes(subpath) &&
      (options.only === undefined || options.only.length === 0 || options.only.includes(subpath)),
  );
  return subpaths.map(subpath => ({
    subpath,
    specifier: subpath === '.' ? name : `${name}${subpath.slice(1)}`,
  }));
}

/** The entry file: every export is used, the worst case for "I import this entry point". */
export function entrySource(specifier: string): string {
  return `import * as m from ${JSON.stringify(specifier)};\nexport { m };\n`;
}
