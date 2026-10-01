import { findDataDirectory, readDataFile } from './data-directory.ts';

/** One entry of `data/source.json`: a vendored or curated source and the version it is pinned to. */
export interface DataSource {
  /** The name of the provider that reads this source. */
  provider: string;
  url: string;
  /** Runtime versions the data describes, e.g. `{ workerd: '1.20260424.1' }`. */
  versions: Record<string, string>;
  commit?: string;
  generatedAt?: string;
  /** An SPDX id, or `none` for facts read from documentation that has no open license. */
  license: string;
  /** What else to know about the source. */
  note?: string;
  /** Runtime settings the data was generated with, keyed by runtime. */
  settings?: Record<string, unknown>;
}

interface Manifest {
  sources: DataSource[];
}

export function readSources(dataDirectory: string): DataSource[] {
  return readDataFile<Manifest>(dataDirectory, 'source.json').sources;
}

/** Every runtime the pinned data describes, with its version. */
export function readRuntimeVersions(): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const source of readSources(findDataDirectory())) {
    Object.assign(versions, source.versions);
  }
  return versions;
}

export function findSource(dataDirectory: string, provider: string): DataSource {
  const source = readSources(dataDirectory).find(entry => entry.provider === provider);
  if (source === undefined) {
    throw new Error(`edgefit's data manifest has no source for ${provider}`);
  }
  return source;
}

/** E.g. `workers-nodejs-compat-matrix@ee58120 (workerd 1.20260424.1)`. */
export function describeSource(
  source: DataSource,
  runtimes: readonly string[] = Object.keys(source.versions),
): string {
  const name =
    source.commit === undefined
      ? source.provider
      : `${source.provider}@${source.commit.slice(0, 7)}`;
  const versions = runtimes.map(runtime => `${runtime} ${source.versions[runtime]}`).join('; ');
  return `${name} (${versions})`;
}
