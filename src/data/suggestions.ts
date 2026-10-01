import { findDataDirectory, readDataFile } from '@/data/data-directory.ts';
import type { Suggestion, TargetKey } from '@/types.ts';

/** One reviewed fix in `data/suggestions.json`. */
export interface SuggestionEntry {
  targets: TargetKey[];
  /** `setting` is only for the hints edgefit works out itself. */
  kind: Exclude<Suggestion['kind'], 'setting'>;
  text: string;
  /** For `replace`: the package to use instead. */
  package?: string;
  /** Narrows a package entry to findings for these APIs. A trailing `*` matches a prefix. */
  apis?: string[];
  /** Where the fix is documented or verified. */
  source: string;
  /** When someone last checked the source, as `YYYY-MM-DD`. */
  reviewed: string;
}

export interface SuggestionData {
  /** Keyed by the name of the package the finding is in. */
  packages: Record<string, SuggestionEntry[]>;
  /** Keyed by API as shown in reports, such as `node:fs.watch`. A trailing `*` matches a prefix. */
  apis: Record<string, SuggestionEntry[]>;
}

interface SuggestionsFile extends SuggestionData {
  version: number;
}

const fileVersion = 1;
// One key per target: a target added to `TargetKey` without one here does not compile.
export const targetKeys = new Set<string>(
  Object.keys({
    workerd: true,
    bun: true,
    deno: true,
    'deno-deploy': true,
    'netlify-edge': true,
    'vercel-edge': true,
  } satisfies Record<TargetKey, true>),
);
const kinds = new Set<string>(['replace', 'change']);

function invalid(where: string, problem: string): never {
  throw new Error(`data/suggestions.json, ${where}: ${problem}`);
}

function checkEntry(where: string, entry: SuggestionEntry): void {
  if (entry.targets.length === 0 || !entry.targets.every(target => targetKeys.has(target))) {
    invalid(where, 'targets must list known target keys');
  }
  if (!kinds.has(entry.kind)) {
    invalid(where, 'kind must be replace or change');
  }
  if (entry.text.trim() === '') {
    invalid(where, 'text is empty');
  }
  if (entry.kind === 'replace' && entry.package === undefined) {
    invalid(where, 'a replace entry names the package to use');
  }
  if (!entry.source.startsWith('https://')) {
    invalid(where, 'source must be an https link');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(entry.reviewed)) {
    invalid(where, 'reviewed must be a YYYY-MM-DD date');
  }
}

let cached: SuggestionData | undefined;

/** Reads and checks `data/suggestions.json`. A bad entry throws, so it cannot ship. */
export function loadSuggestions(dataDirectory?: string): SuggestionData {
  if (dataDirectory === undefined && cached !== undefined) {
    return cached;
  }
  const file = readDataFile<SuggestionsFile>(
    dataDirectory ?? findDataDirectory(),
    'suggestions.json',
  );
  if (file.version !== fileVersion) {
    invalid('version', `expected ${fileVersion}`);
  }
  for (const [group, entries] of Object.entries({ packages: file.packages, apis: file.apis })) {
    for (const [key, list] of Object.entries(entries)) {
      for (const [index, entry] of list.entries()) {
        checkEntry(`${group}.${key}[${index}]`, entry);
      }
    }
  }
  const data = { packages: file.packages, apis: file.apis };
  if (dataDirectory === undefined) {
    cached = data;
  }
  return data;
}

function matches(pattern: string, value: string): boolean {
  return pattern.endsWith('*') ? value.startsWith(pattern.slice(0, -1)) : pattern === value;
}

export interface SuggestionQuery {
  api: string;
  /** The package the code is in, or `undefined` for the project's own code. */
  package: string | undefined;
  target: TargetKey;
}

function toSuggestion(entry: SuggestionEntry, target: TargetKey): Suggestion {
  return {
    kind: entry.kind,
    text: entry.text,
    ...(entry.package === undefined ? {} : { package: entry.package }),
    target,
    source: entry.source,
  };
}

/** The entry for the most specific key that matches: an exact one, then the longest prefix. */
function findByApi(
  data: SuggestionData,
  api: string,
  forTarget: (entry: SuggestionEntry) => boolean,
): SuggestionEntry | undefined {
  const specificity = (pattern: string): number =>
    pattern.endsWith('*') ? pattern.length - 1 : Number.POSITIVE_INFINITY;
  return Object.entries(data.apis)
    .filter(([pattern]) => matches(pattern, api))
    .toSorted(([left], [right]) => specificity(right) - specificity(left))
    .flatMap(([, list]) => list)
    .find(entry => forTarget(entry));
}

/**
 * The fix for a finding. An entry for the package wins over one for the API, because it knows
 * more about what the package needs.
 */
export function findSuggestion(
  data: SuggestionData,
  query: SuggestionQuery,
): Suggestion | undefined {
  const forTarget = (entry: SuggestionEntry): boolean => entry.targets.includes(query.target);
  const fromPackage = (
    query.package === undefined ? [] : (data.packages[query.package] ?? [])
  ).find(
    entry =>
      forTarget(entry) &&
      (entry.apis === undefined || entry.apis.some(api => matches(api, query.api))),
  );
  const entry = fromPackage ?? findByApi(data, query.api, forTarget);
  return entry === undefined ? undefined : toSuggestion(entry, query.target);
}
