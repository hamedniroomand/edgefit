import { readDataFile } from '@/data/data-directory.ts';
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
}

interface OverridesFile {
  /** Keyed by module, e.g. `child_process`. */
  modules: Record<string, OverrideEntry>;
  /** Keyed by module and member path, e.g. `fs.promises.watch`. */
  apis: Record<string, OverrideEntry>;
}

/**
 * Curated results from `data/overrides/<target>.json` for APIs that exist but throw or
 * no-op when called. Tree sources such as the matrix only record whether an API exists.
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
      ): CompatEntry => ({
        target,
        module,
        path,
        status,
        ...(status === 'supported' ? {} : { note: entry.note }),
        source: { provider: name, version, url: `${url}/${entry.source}` },
      });
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
