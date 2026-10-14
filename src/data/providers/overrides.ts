import { URL } from 'node:url';

import { readDataFile } from '@/data/data-directory.ts';
import type { OptionMatch } from '@/data/dump.ts';
import { findSource } from '@/data/manifest.ts';
import type { TargetKey } from '@/types.ts';

import type { CompatEntry, CompatProvider } from './provider.ts';

interface OverrideEntry {
  /** `supported` silences matrix differences that are not behavior differences, such as `process.versions.*`. */
  status: CompatEntry['status'];
  note: string;
  /** Path of the runtime source file, relative to the source's URL. */
  source: string;
  /** Members of an overridden module that work. */
  except?: string[];
  /** The stub checks its arguments before it throws, which the runtime probe knows about. */
  validatesFirst?: boolean;
  /** The API is missing on the target and the code works without it, so the runtime probe does not take a missing API as a stale entry. Only with status `supported`. */
  missingHarmless?: true;
  /**
   * The API does not exist on the target, as when the matrix lacks it, not a stub that throws.
   * Only with status `unsupported`: a mocked or mismatched API exists.
   */
  absent?: true;
  /** The options that make a call fail. Only with status `mismatch`. */
  options?: OptionMatch[];
}

interface OverridesFile {
  /** Keyed by module, e.g. `child_process`. */
  modules: Record<string, OverrideEntry>;
  /** Keyed by module and member path, e.g. `fs.promises.watch`. */
  apis: Record<string, OverrideEntry>;
}

const literalTypes = new Set(['boolean', 'number', 'string']);

const isGate = (gate: unknown): boolean => {
  if (typeof gate !== 'object' || gate === null) {
    return false;
  }
  const { flag, date, disableFlag } = gate as Record<string, unknown>;
  return (
    typeof flag === 'string' &&
    typeof date === 'string' &&
    (disableFlag === undefined || typeof disableFlag === 'string')
  );
};

function isOptionMatch(item: unknown): item is OptionMatch {
  if (typeof item === 'string') {
    return true;
  }
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const { key, value, gate } = item as Record<string, unknown>;
  return (
    typeof key === 'string' &&
    (value === undefined || literalTypes.has(typeof value)) &&
    (gate === undefined || isGate(gate))
  );
}

/** The hand-written `options` of an entry, after a check of their type. */
function optionsOf(file: string, key: string, entry: OverrideEntry): OptionMatch[] | undefined {
  const options: unknown = entry.options;
  if (options === undefined) {
    return undefined;
  }
  const problem =
    entry.status === 'mismatch'
      ? undefined
      : `are allowed only with the status mismatch, and the status is ${entry.status}`;
  const shape =
    !Array.isArray(options) || options.length === 0
      ? 'must be a list with one item or more'
      : undefined;
  const item =
    Array.isArray(options) && !options.every(option => isOptionMatch(option))
      ? 'have an item of a wrong type. An item is a key, or an object with a key, a value that is a boolean, a number or a string, and a gate with a flag and a date'
      : undefined;
  const reason = problem ?? shape ?? item;
  if (reason !== undefined) {
    throw new Error(`${file}: the options of ${key} ${reason}.`);
  }
  return options as OptionMatch[];
}

/**
 * Curated results from `data/overrides/<target>.json` for APIs that exist but throw or
 * no-op when called, or that a platform build lacks although the matrix has them (`absent`).
 * Tree sources such as the matrix only record whether an API exists.
 */
export function overridesProvider(target: TargetKey): CompatProvider<CompatEntry[]> {
  const name = `overrides/${target}`;
  return {
    name,
    load: dataDirectory => {
      const { url, versions } = findSource(dataDirectory, name);
      const file = readDataFile<OverridesFile>(dataDirectory, `overrides/${target}.json`);
      const version = versions[target] ?? 'unknown';

      const toEntry = (
        module: string,
        path: string[],
        entry: OverrideEntry,
        status: CompatEntry['status'] = entry.status,
      ): CompatEntry => {
        const options = optionsOf(`overrides/${target}.json`, [module, ...path].join('.'), entry);
        return {
          target,
          module,
          path,
          status,
          ...(status === 'supported' ? {} : { note: entry.note }),
          ...(status === 'unsupported' && entry.absent === true ? { absent: true as const } : {}),
          ...(status === 'mismatch' && options !== undefined ? { options } : {}),
          source: { provider: name, version, url: new URL(entry.source, `${url}/`).href },
        };
      };
      const moduleEntries = Object.entries(file.modules).flatMap(([module, entry]) =>
        (entry.except ?? [])
          .map(member => toEntry(module, [member], entry, 'supported'))
          .concat(toEntry(module, [], entry)),
      );
      const apiEntries = Object.entries(file.apis).map(([key, entry]) => {
        const [module = key, ...path] = key.split('.');
        return toEntry(module, path, entry);
      });
      return [...moduleEntries, ...apiEntries];
    },
  };
}
