import { readDataFile } from '@/data/data-directory.ts';
import { findSource } from '@/data/manifest.ts';

import type { CompatEntry, CompatProvider } from './provider.ts';
import type { WebKey, WebRuntime } from './runtime-compat-data.ts';

interface DomGlobalsFile {
  /** The globals of a window that a worker scope does not have. */
  names: string[];
  /** The names that the runtime of one column also has, by column. */
  presentOn: Partial<Record<string, string[]>>;
}

const name = 'dom-globals';

/**
 * The DOM globals that a runtime lacks. A server runtime has almost no DOM, so a read of one by its
 * plain name throws a `ReferenceError`. Only a read of the plain name as the module loads is a
 * finding, because a read in other code often sits behind an environment check that edgefit cannot
 * read. The column is the key of the runtime in `presentOn`: `webKey` when a platform has one,
 * such as `netlify`, else the runtime.
 */
export function domGlobalsProvider(
  runtime: WebRuntime,
  webKey?: WebKey,
): CompatProvider<CompatEntry[]> {
  return {
    name,
    load: dataDirectory => {
      const { url, versions } = findSource(dataDirectory, name);
      const data = readDataFile<DomGlobalsFile>(dataDirectory, `${name}.json`);
      const present = new Set(data.presentOn[webKey ?? runtime] ?? []);
      const source = { provider: name, version: `typescript ${versions.typescript}`, url };
      return data.names
        .filter(global => !present.has(global))
        .map(global => ({
          target: runtime,
          module: '*globals*',
          path: [global],
          status: 'unsupported' as const,
          note: `needs the ${global} global, which the target does not have, so a read of it throws a ReferenceError`,
          absent: true as const,
          loadOnly: true as const,
          source,
        }));
    },
  };
}
