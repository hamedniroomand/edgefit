import { findDataDirectory, readDataFile } from '@/data/data-directory.ts';
import { targetKeys } from '@/data/suggestions.ts';
import type { TargetKey } from '@/types.ts';

/** One reviewed case in `data/unreached.json`. */
export type UnreachedEntry = {
  package: string;
  /** The releases the entry was read in, both ends included, as `major.minor.patch`. */
  versions: { min: string; max: string };
  /** The file inside the package, such as `dist/esm/server/app-render/cache-signal.js`. */
  file: string;
  /** APIs as shown in reports. */
  apis: string[];
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
};

const fileVersion = 1;
const semver = /^\d+\.\d+\.\d+$/u;

/** The releases an entry was read in. A missing `max` has no upper end. */
export type VersionRange = { min: string; max?: string };

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

function checkEntry(where: string, entry: UnreachedEntry): void {
  if (!hasText(entry) || entry.apis.length === 0) {
    invalidEntry('unreached.json', where, 'package, file, apis and reason are required');
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

function parts(version: string): number[] {
  return version.split('.').map(Number);
}

/** Compares `major.minor.patch` versions. A pre-release suffix is read as its release. */
export function compareVersions(left: string, right: string): number {
  const [a, b] = [parts(left), parts(right)];
  for (const index of [0, 1, 2]) {
    const order = (a[index] ?? 0) - (b[index] ?? 0);
    if (order !== 0) {
      return order;
    }
  }
  return 0;
}

export function inRange(version: string, { min, max }: VersionRange): boolean {
  return (
    compareVersions(version, min) >= 0 && (max === undefined || compareVersions(version, max) <= 0)
  );
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
      fileInPackage(query.file, entry.package) === entry.file,
  );
}
