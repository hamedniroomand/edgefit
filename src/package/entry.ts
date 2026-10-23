import path from 'node:path';

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

/** What a package result keeps about a subpath that is not checked. */
export interface SkippedSubpath {
  subpath: string;
  reason: string;
}

// The extensions of a script. A target with no extension counts as a script too: Node loads it.
const scriptExtensions = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);

const declarationFile = /\.d\.[cm]?ts$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The strings at the end of a condition tree. `null` blocks a subpath, so it has none. */
function targetsOf(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(item => targetsOf(item));
  }
  return isRecord(value) ? Object.values(value).flatMap(item => targetsOf(item)) : [];
}

/** The extension of a target, in lower case. A type declaration file has `.d.ts`, not `.ts`. */
function extensionOf(target: string): string {
  return (declarationFile.exec(target)?.[0] ?? path.posix.extname(target)).toLowerCase();
}

const isScript = (target: string): boolean => {
  const extension = extensionOf(target);
  return extension === '' || scriptExtensions.has(extension);
};

/** Why a subpath with these targets is not checked. A JSON file gets its own sentence. */
function reasonFor(targets: readonly string[]): string {
  const extensions = [...new Set(targets.map(target => extensionOf(target)))];
  return extensions.join() === '.json'
    ? 'the target of this subpath is a JSON file, which holds no code to check'
    : `no target of this subpath is a script file (${extensions.join(', ')})`;
}

/** The subpaths of `exports` with their targets. A string, an array or a bare condition object is the sugar for `.`. */
function declaredOf(exports: unknown): { subpath: string; targets: string[] }[] {
  if (isRecord(exports) && Object.keys(exports).some(key => key.startsWith('.'))) {
    return Object.entries(exports)
      .filter(([key]) => key.startsWith('.'))
      .map(([subpath, value]) => ({ subpath, targets: targetsOf(value) }));
  }
  return [{ subpath: '.', targets: targetsOf(exports) }];
}

/**
 * The public entry points to check, and the subpaths left out because no target of them is a
 * script, such as a sourcemap. Patterns (`./*`) and `./package.json` are left out without a
 * note, as is a subpath that the package blocks with `null`. Without an `exports` field the
 * package is imported through `main` or `module`, or its `index.js`.
 */
export function packageEntries(
  manifest: PackageManifest,
  name: string,
  options: { skip?: readonly string[]; only?: readonly string[] } = {},
): { entries: PackageEntry[]; skipped: SkippedSubpath[] } {
  const declared =
    manifest.exports === undefined || manifest.exports === null
      ? [{ subpath: '.', targets: ['./index.js'] }]
      : declaredOf(manifest.exports);
  const wanted = declared.filter(
    ({ subpath }) =>
      subpath !== './package.json' &&
      !subpath.includes('*') &&
      !(options.skip ?? []).includes(subpath) &&
      (options.only === undefined || options.only.length === 0 || options.only.includes(subpath)),
  );
  const isChecked = ({ targets }: { targets: readonly string[] }): boolean =>
    targets.some(target => isScript(target));
  return {
    entries: wanted
      .filter(item => isChecked(item))
      .map(({ subpath }) => ({
        subpath,
        specifier: subpath === '.' ? name : `${name}${subpath.slice(1)}`,
      })),
    skipped: wanted
      .filter(item => item.targets.length > 0 && !isChecked(item))
      .map(({ subpath, targets }) => ({ subpath, reason: reasonFor(targets) })),
  };
}

/** The entry file: every export is used, the worst case for "I import this entry point". */
export function entrySource(specifier: string): string {
  return `import * as m from ${JSON.stringify(specifier)};\nexport { m };\n`;
}
