import { readDataFile } from '@/data/data-directory.ts';
import { findSource } from '@/data/manifest.ts';
import type { ApiRef } from '@/types.ts';

import type { CompatEntry, CompatProvider } from './provider.ts';

export type WebRuntime = 'workerd' | 'bun' | 'deno' | 'vercel-edge';

/** The runtime-compat-data keys edgefit reads. Platforms such as Netlify have keys of their own. */
export type WebKey = 'workerd' | 'bun' | 'deno' | 'netlify' | 'edge-light';

interface SupportStatement {
  version_added: string | boolean | null;
  version_removed?: string | boolean | null;
}

interface CompatStatement {
  support: Partial<Record<string, SupportStatement | SupportStatement[]>>;
}

/** A feature in the MDN browser-compat-data format: its own statement and its sub-features. */
interface Feature {
  __compat?: CompatStatement;
  [name: string]: Feature | CompatStatement | undefined;
}

const name = 'runtime-compat-data';

// Vercel's Edge runtime is `edge-light` in runtime-compat-data.
const defaultColumns: Record<WebRuntime, WebKey> = {
  workerd: 'workerd',
  bun: 'bun',
  deno: 'deno',
  'vercel-edge': 'edge-light',
};

// Interfaces whose instance members code reaches through a global, e.g. `navigator.gpu`.
const instanceGlobals = new Map([
  ['Navigator', ['navigator']],
  ['Performance', ['performance']],
  ['CacheStorage', ['caches']],
  ['Crypto', ['crypto']],
  ['SubtleCrypto', ['crypto', 'subtle']],
]);

const staticSuffix = '_static';

/**
 * Maps a BCD key to the global API code reaches it through: `api.BroadcastChannel` is the
 * global itself, `api.URL.canParse_static` a static member and `api.Navigator.gpu` a member of
 * the `navigator` instance. Constructors, events and members of instances code creates itself
 * have no such path, and deeper keys describe parameters rather than members.
 */
export function apiRefFor(key: string): ApiRef | undefined {
  const [root, global, member, ...rest] = key.split('.');
  if (root !== 'api' || global === undefined || rest.length > 0) {
    return undefined;
  }
  if (member === undefined) {
    return { module: '*globals*', path: [global] };
  }
  if (member.endsWith(staticSuffix)) {
    return { module: '*globals*', path: [global, member.slice(0, -staticSuffix.length)] };
  }
  const instance = instanceGlobals.get(global);
  if (instance === undefined || member.endsWith('_event')) {
    return undefined;
  }
  return { module: '*globals*', path: [...instance, member] };
}

function statusFor(
  statement: CompatStatement | undefined,
  runtime: WebKey,
): CompatEntry['status'] | undefined {
  const support = statement?.support[runtime];
  // BCD lists the most relevant statement first.
  const current = Array.isArray(support) ? support[0] : support;
  // `null` means support is unknown.
  const added = current?.version_added ?? null;
  if (added === null) {
    return undefined;
  }
  const removed = (current?.version_removed ?? false) !== false;
  return added === false || removed ? 'unsupported' : 'supported';
}

function* features(feature: Feature, key: string): Generator<[string, Feature]> {
  yield [key, feature];
  for (const [child, value] of Object.entries(feature)) {
    if (child !== '__compat') {
      yield* features(value as Feature, `${key}.${child}`);
    }
  }
}

/**
 * Web API support from runtime-compat-data. The data is auto-generated and not fully accurate,
 * so its problems are reported in their own `web` category.
 */
export function runtimeCompatDataProvider(
  runtime: WebRuntime,
  column: WebKey = defaultColumns[runtime],
): CompatProvider<CompatEntry[]> {
  return {
    name,
    load: dataDirectory => {
      const { url, versions } = findSource(dataDirectory, name);
      const data = readDataFile<{ api: Feature }>(dataDirectory, `${name}/data.json`);
      const source = { provider: name, version: versions.npm ?? 'unknown', url };
      return [...features(data.api, 'api')].flatMap(([key, feature]): CompatEntry[] => {
        const api = apiRefFor(key);
        const status = statusFor(feature.__compat, column);
        if (api === undefined || status === undefined) {
          return [];
        }
        return [
          {
            target: runtime,
            ...api,
            status,
            ...(status === 'supported'
              ? {}
              : {
                  note: `is missing on the target according to ${name}, which is auto-generated and may be inaccurate`,
                  category: 'web' as const,
                }),
            source,
          },
        ];
      });
    },
  };
}
