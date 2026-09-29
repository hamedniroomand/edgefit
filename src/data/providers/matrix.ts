import { readDataFile } from '@/data/data-directory.ts';
import type { Dump } from '@/data/dump.ts';
import { findSource } from '@/data/manifest.ts';

import type { CompatProvider, CompatTree } from './provider.ts';

export type MatrixRuntime = 'workerd' | 'bun' | 'deno';

const name = 'workers-nodejs-compat-matrix';

/** The matrix keys prefix-only modules such as `node:sqlite` with their prefix. */
function withoutNodePrefix(dump: Dump): Dump {
  return Object.fromEntries(
    Object.entries(dump).map(([key, node]) => [key.replace(/^node:/u, ''), node]),
  );
}

/** Reads a runtime's dump from workers-nodejs-compat-matrix, with the Node baseline it is compared to. */
export function matrixProvider(runtime: MatrixRuntime): CompatProvider<CompatTree> {
  return {
    name,
    load: dataDirectory => {
      const source = findSource(dataDirectory, name);
      return {
        baseline: withoutNodePrefix(readDataFile(dataDirectory, `${name}/baseline.json`)),
        runtime: withoutNodePrefix(readDataFile(dataDirectory, `${name}/${runtime}.json`)),
        source: {
          provider: name,
          version: source.versions[runtime] ?? 'unknown',
          url: `${source.url}/tree/${source.commit}`,
        },
      };
    },
  };
}
