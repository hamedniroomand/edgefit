import { findDataDirectory, readDataFile } from '@/data/data-directory.ts';
import { targetKeys } from '@/data/suggestions.ts';
import { inRange, semver } from '@/data/version-range.ts';
import type { VersionRange } from '@/data/version-range.ts';
import type { TargetKey } from '@/types.ts';

/** One reviewed case in `data/unreached.json`. */
export type UnreachedEntry = {
  package: string;
  /** The releases the entry was read in, both ends included, as `major.minor.patch`. */
  versions: { min: string; max: string };
  /** The file inside the package, such as `dist/esm/server/app-render/cache-signal.js`. */
  file: string;
  /**
   * The other files of the package that hold the condition that the reason names. edgefit does not
   * use this field when it checks a project. Only the weekly check reads it: it widens a range only
   * when each of these files has the same bytes in both releases. The loader checks the shape.
   */
  guards?: string[];
  /** APIs as shown in reports. */
  apis: string[];
  /**
   * The options that make the code run. The entry applies only when no file of the project sets
   * one of them. In build output it always applies. An entry without `options` applies to every
   * project. An item is a name, such as `http2`, which a property of an object literal or an
   * assigned member sets, or a path, such as `auth.lock`, which is the property `lock` of an object
   * literal that is the value of the property `auth`.
   */
  options?: string[];
  target: TargetKey;
  /** Why the code does not run on the target. */
  reason: string;
  /** Where the reason is stated. */
  source: string;
};

export type UnreachedQuery = {
  package: string;
  version: string;
  /** The file of the usage, as a path from the project root. */
  file: string;
  api: string;
  target: TargetKey;
  /** The options that a file of the project sets. A package file does not count. Empty in build output. */
  optionsSet: ReadonlySet<string>;
};

const fileVersion = 1;

/** The fields that every reviewed entry of a data file has. */
export type EntryBase = {
  package: string;
  versions: VersionRange;
  file: string;
  reason: string;
  source: string;
};

export function invalidEntry(fileName: string, where: string, problem: string): never {
  throw new Error(`data/${fileName}, ${where}: ${problem}`);
}

/** Checks the version range and the source link of an entry. */
export function checkRangeAndSource(fileName: string, where: string, entry: EntryBase): void {
  const { min, max } = entry.versions;
  if (!semver.test(min) || (max !== undefined && !semver.test(max))) {
    invalidEntry(fileName, where, 'versions must be major.minor.patch');
  }
  if (!entry.source.startsWith('https://')) {
    invalidEntry(fileName, where, 'source must be an https link');
  }
}

/** Whether the entry has a text in each of the fields `package`, `file` and `reason`. */
export function hasText(entry: EntryBase): boolean {
  return [entry.package, entry.file, entry.reason].every(text => text.trim() !== '');
}

/** Reads a data file of reviewed entries and checks each one. A bad entry throws, so it cannot ship. */
export function readEntries<TEntry>(
  fileName: string,
  dataDirectory: string | undefined,
  check: (where: string, entry: TEntry) => void,
): TEntry[] {
  const file = readDataFile<{ version: number; entries: TEntry[] }>(
    dataDirectory ?? findDataDirectory(),
    fileName,
  );
  if (file.version !== fileVersion) {
    invalidEntry(fileName, 'version', `expected ${fileVersion}`);
  }
  for (const [index, entry] of file.entries.entries()) {
    check(`entries[${index}]`, entry);
  }
  return file.entries;
}

function validNames(names: unknown): names is string[] {
  return (
    Array.isArray(names) &&
    names.length > 0 &&
    names.every(name => typeof name === 'string' && name.trim() !== '')
  );
}

/** An option is a name or a path of names, such as `auth.lock`, with no empty name in it. */
function validOptions(options: unknown): options is string[] {
  return (
    validNames(options) && options.every(name => name.split('.').every(part => part.trim() !== ''))
  );
}

/** A list of paths from the package root: not absolute, and with no `..` segment. */
function validGuards(guards: unknown): boolean {
  return (
    validNames(guards) &&
    guards.every(guard => !guard.startsWith('/') && !guard.split('/').includes('..'))
  );
}

function checkEntry(where: string, entry: UnreachedEntry): void {
  if (!hasText(entry) || entry.apis.length === 0) {
    invalidEntry('unreached.json', where, 'package, file, apis and reason are required');
  }
  if (entry.options !== undefined && !validOptions(entry.options)) {
    invalidEntry(
      'unreached.json',
      where,
      'options must be a list of one or more option names or paths, such as `http2` or `auth.lock`',
    );
  }
  if (entry.guards !== undefined && !validGuards(entry.guards)) {
    invalidEntry(
      'unreached.json',
      where,
      'guards must be a list of one or more paths from the package root, with no leading `/` and no `..` segment',
    );
  }
  if (!targetKeys.has(entry.target)) {
    invalidEntry('unreached.json', where, 'target must be a known target key');
  }
  checkRangeAndSource('unreached.json', where, entry);
}

let cached: UnreachedEntry[] | undefined;

/** Reads and checks `data/unreached.json`. */
export function loadUnreached(dataDirectory?: string): UnreachedEntry[] {
  if (dataDirectory === undefined && cached !== undefined) {
    return cached;
  }
  const entries = readEntries('unreached.json', dataDirectory, checkEntry);
  if (dataDirectory === undefined) {
    cached = entries;
  }
  return entries;
}

/** The options of the entries that are paths, such as `auth.lock`. The scan reads these in addition to every plain name. */
export function unreachedOptionPaths(entries: readonly UnreachedEntry[]): string[] {
  const paths = entries.flatMap(entry => (entry.options ?? []).filter(name => name.includes('.')));
  return [...new Set(paths)].toSorted();
}

/** The part of a path below `node_modules/<package>/`, or `undefined` when it is not in that package. */
export function fileInPackage(file: string, name: string): string | undefined {
  const marker = `node_modules/${name}/`;
  const index = file.lastIndexOf(marker);
  return index === -1 ? undefined : file.slice(index + marker.length);
}

export function findUnreached(
  entries: readonly UnreachedEntry[],
  query: UnreachedQuery,
): UnreachedEntry | undefined {
  return entries.find(
    entry =>
      entry.target === query.target &&
      entry.package === query.package &&
      entry.apis.includes(query.api) &&
      inRange(query.version, entry.versions) &&
      fileInPackage(query.file, entry.package) === entry.file &&
      !(entry.options ?? []).some(name => query.optionsSet.has(name)),
  );
}
