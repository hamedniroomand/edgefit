import { readMatrix, readOverrides } from './data.mjs';
import { missingApis } from './drift.mjs';

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

/**
 * The APIs to probe. By default only those already curated; `discover` adds every API in the
 * matrix baseline, and `drift` adds a lookup of each API the runtime's data marks missing, to see
 * whether it exists now.
 */
export function buildSpec(runtime, { discover = false, mocked = false, drift = false } = {}) {
  const overrides = readOverrides(runtime);
  const baseline = readMatrix('baseline');
  const kinds = new Map(flattenMatrix(baseline).map(({ api, kind }) => [api, kind]));
  const names = new Set(Object.keys(overrides));
  if (discover) {
    for (const api of kinds.keys()) {
      names.add(api);
    }
  }
  const lookups = drift ? missingApis(readMatrix(runtime), baseline, overrides) : [];
  return {
    apis: [
      ...[...names].sort().map(api => ({ api, kind: kinds.get(api) })),
      ...lookups.filter(api => !names.has(api)).map(api => ({ api, lookup: true })),
    ],
    mocked: mocked ? Object.keys(overrides).filter(api => overrides[api].status === 'mocked') : [],
  };
}
