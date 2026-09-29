import { isDenied } from './classify.mjs';

const MISSING_OR_UNSUPPORTED = new Set(['missing', 'unsupported']);

/** Whether a matrix tree has the API, walking `module` then the member path. */
export function matrixHas(tree, api) {
  const [module, ...path] = api.split('.');
  let node = tree[module];
  for (const key of path) {
    node = typeof node === 'object' ? node[key] : undefined;
  }
  // The data lists what the runtime lacks as `missing`, on the API or on the object holding it.
  const type = typeof node === 'object' ? node?.['*self*'] : node;
  return node !== undefined && type !== 'missing';
}

function overrideDisagreement(override, outcome) {
  const stub = override.status === 'unsupported';
  const probedAsStub = MISSING_OR_UNSUPPORTED.has(outcome);
  return stub === probedAsStub
    ? undefined
    : `override says \`${override.status}\`, probe says \`${outcome}\``;
}

/**
 * Lists where probe outcomes and curated data disagree. Matrix disagreements are only reported for
 * APIs without an override, since an override exists to correct the matrix.
 */
export function compareOutcomes(outcomes, overrides, matrix) {
  const disagreements = [];
  for (const [api, outcome] of Object.entries(outcomes)) {
    // Denied APIs are never called, so an existing one says nothing about the override.
    if (isDenied(api) && outcome !== 'missing') {
      continue;
    }
    const override = overrides[api];
    const message = override
      ? overrideDisagreement(override, outcome)
      : matrixDisagreement(matrix, api, outcome);
    if (message) {
      disagreements.push({ api, message });
    }
  }
  return disagreements;
}

function matrixDisagreement(matrix, api, outcome) {
  const inMatrix = matrixHas(matrix, api);
  const probed = outcome !== 'missing';
  if (inMatrix === probed) {
    return undefined;
  }
  return `matrix says \`${inMatrix ? 'present' : 'missing'}\`, probe says \`${outcome}\``;
}

/** Probed `unsupported` APIs that no override covers, as candidates for a person to review. */
export function proposeOverrides(outcomes, overrides) {
  return Object.entries(outcomes)
    .filter(([api, outcome]) => outcome === 'unsupported' && !overrides[api])
    .map(([api]) => api);
}

/** Curated `mocked` entries whose targeted check found a working implementation. */
export const implementedMocks = mocked =>
  Object.entries(mocked)
    .filter(([, outcome]) => outcome === 'implemented')
    .map(([api]) => api);
