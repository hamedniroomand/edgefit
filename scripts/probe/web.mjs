import { readData } from './data.mjs';

const STATIC_SUFFIX = '_static';

// Interfaces whose instance members code reaches through a global, e.g. `navigator.gpu`.
// This copies `instanceGlobals` in `src/data/providers/runtime-compat-data.ts`, which a
// Node script cannot import; `test/probe/web.test.ts` checks that both give the same APIs.
const INSTANCE_GLOBALS = new Map([
  ['Navigator', ['navigator']],
  ['Performance', ['performance']],
  ['CacheStorage', ['caches']],
  ['Crypto', ['crypto']],
  ['SubtleCrypto', ['crypto', 'subtle']],
]);

/** Names a Web API the way the probe looks it up: `api.URL.canParse_static` is `*globals*.URL.canParse`. */
function globalName(key) {
  const [root, global, member, ...rest] = key.split('.');
  if (root !== 'api' || global === undefined || rest.length > 0) {
    return undefined;
  }
  if (member === undefined) {
    return `*globals*.${global}`;
  }
  if (member.endsWith(STATIC_SUFFIX)) {
    return `*globals*.${global}.${member.slice(0, -STATIC_SUFFIX.length)}`;
  }
  const instance = INSTANCE_GLOBALS.get(global);
  return instance === undefined || member.endsWith('_event')
    ? undefined
    : ['*globals*', ...instance, member].join('.');
}

function* features(feature, key) {
  yield [key, feature];
  for (const [child, value] of Object.entries(feature)) {
    if (child !== '__compat') {
      yield* features(value, `${key}.${child}`);
    }
  }
}

const isUnsupported = (statement, runtime) => {
  const support = statement?.support?.[runtime];
  // The data lists the most relevant statement first, and `null` means support is unknown.
  const current = Array.isArray(support) ? support[0] : support;
  const added = current?.version_added ?? null;
  return added !== null && (added === false || (current?.version_removed ?? false) !== false);
};

/** The global Web APIs that `runtime-compat-data` marks missing for the runtime. */
export function webMissingApis(runtime, data = readData('runtime-compat-data/data.json')) {
  const found = new Set();
  for (const [key, feature] of features(data.api, 'api')) {
    const name = globalName(key);
    if (name !== undefined && isUnsupported(feature.__compat, runtime)) {
      found.add(name);
    }
  }
  return [...found].sort();
}
