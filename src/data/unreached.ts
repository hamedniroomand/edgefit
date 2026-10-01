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

type UnreachedFile = {
  version: number;
  entries: UnreachedEntry[];
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

function invalid(where: string, problem: string): never {
  throw new Error(`data/unreached.json, ${where}: ${problem}`);
}

function checkEntry(where: string, entry: UnreachedEntry): void {
  const empty = [entry.package, entry.file, entry.reason].some(text => text.trim() === '');
  if (empty || entry.apis.length === 0) {
    invalid(where, 'package, file, apis and reason are required');
  }
  if (!targetKeys.has(entry.target)) {
    invalid(where, 'target must be a known target key');
  }
  if (!semver.test(entry.versions.min) || !semver.test(entry.versions.max)) {
    invalid(where, 'versions must be major.minor.patch');
  }
  if (!entry.source.startsWith('https://')) {
    invalid(where, 'source must be an https link');
  }
}

let cached: UnreachedEntry[] | undefined;

/** Reads and checks `data/unreached.json`. A bad entry throws, so it cannot ship. */
export function loadUnreached(dataDirectory?: string): UnreachedEntry[] {
  if (dataDirectory === undefined && cached !== undefined) {
    return cached;
  }
  const file = readDataFile<UnreachedFile>(dataDirectory ?? findDataDirectory(), 'unreached.json');
  if (file.version !== fileVersion) {
    invalid('version', `expected ${fileVersion}`);
  }
  for (const [index, entry] of file.entries.entries()) {
    checkEntry(`entries[${index}]`, entry);
  }
  if (dataDirectory === undefined) {
    cached = file.entries;
  }
  return file.entries;
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

export function inRange(version: string, { min, max }: UnreachedEntry['versions']): boolean {
  return compareVersions(version, min) >= 0 && compareVersions(version, max) <= 0;
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
