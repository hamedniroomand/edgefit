import { readMatrix, readOverrides } from './data.mjs';
import { missingApis } from './drift.mjs';
import { webMissingApis } from './web.mjs';

/** Flattens a matrix tree into `module.member.path` names with their kind. */
export function flattenMatrix(tree) {
  const apis = [];
  const walk = (prefix, node) => {
    for (const [key, value] of Object.entries(node)) {
      if (key === '*self*') {
        continue;
      }
      const name = `${prefix}.${key}`;
      if (typeof value === 'string') {
        apis.push({ api: name, kind: value });
      } else {
        walk(name, value);
      }
    }
  };
  for (const [module, node] of Object.entries(tree)) {
    if (module !== '*globals*' && typeof node === 'object') {
      walk(module, node);
    }
  }
  return apis;
}

/** Whether the Node baseline has the API, walking its dotted name the way `inDump` does in `src/data/compat-index.ts`. */
const inBaseline = (baseline, api) =>
  api
    .split('.')
    .reduce(
      (node, segment) =>
        node !== null && typeof node === 'object' && Object.hasOwn(node, segment)
          ? node[segment]
          : undefined,
      baseline,
    ) !== undefined;

/**
 * The APIs to probe. By default only those already curated; `discover` adds every API in the
 * matrix baseline, and `drift` adds a lookup of each API the runtime's data marks missing, to see
 * whether it exists now. `presence` replaces all of that with a lookup, never a call, of every
 * module API in the baseline that has no override, which is safe on any runtime and shows what an
 * older release lacks.
 */
export function buildSpec(
  runtime,
  { discover = false, mocked = false, drift = false, presence = false } = {},
) {
  const overrides = readOverrides(runtime);
  const baseline = readMatrix('baseline');
  const kinds = new Map(flattenMatrix(baseline).map(({ api, kind }) => [api, kind]));
  if (presence) {
    return {
      apis: [...kinds.keys()]
        .filter(api => !overrides[api])
        .sort()
        .map(api => ({ api, lookup: true })),
      mocked: [],
    };
  }
  const names = new Set(Object.keys(overrides));
  if (discover) {
    for (const api of kinds.keys()) {
      names.add(api);
    }
  }
  const lookups = drift
    ? [
        ...missingApis(readMatrix(runtime), baseline, overrides),
        // edgefit reads the Web API data only for an API that the baseline lacks.
        ...webMissingApis(runtime).filter(api => !inBaseline(baseline, api)),
      ]
    : [];
  return {
    apis: [
      ...[...names].sort().map(api => ({ api, kind: kinds.get(api) })),
      ...[...new Set(lookups)].filter(api => !names.has(api)).map(api => ({ api, lookup: true })),
    ],
    mocked: mocked ? Object.keys(overrides).filter(api => overrides[api].status === 'mocked') : [],
  };
}
