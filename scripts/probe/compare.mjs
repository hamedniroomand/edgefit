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
  // A mismatch is a partial implementation, so a call with no arguments cannot confirm or refute it.
  if (override.status === 'mismatch') {
    return undefined;
  }
  // A call that returns or throws something else says nothing about a stub, and a stub that
  // `validatesFirst` throws an argument error before it reaches the not-implemented throw.
  if (
    stub &&
    (outcome === 'inconclusive' || (outcome === 'implemented' && override.validatesFirst))
  ) {
    return undefined;
  }
  return stub === probedAsStub
    ? undefined
    : {
        message: `override says \`${override.status}\`, probe says \`${outcome}\``,
        dataSaysPresent: !stub,
      };
}

/**
 * Lists where probe outcomes and curated data disagree. Matrix disagreements are only reported for
 * APIs without an override, since an override exists to correct the matrix.
 */
export function compareOutcomes(outcomes, overrides, matrix, webMissing = new Set()) {
  const disagreements = [];
  for (const [api, outcome] of Object.entries(outcomes)) {
    // Denied APIs are never called, so an existing one says nothing about the override.
    if (isDenied(api) && outcome !== 'missing') {
      continue;
    }
    const override = overrides[api];
    const found = override
      ? overrideDisagreement(override, outcome)
      : matrixDisagreement(matrix, api, outcome, webMissing);
    if (found) {
      disagreements.push({ api, ...found });
    }
  }
  return disagreements;
}

function matrixDisagreement(matrix, api, outcome, webMissing) {
  const inMatrix = matrixHas(matrix, api);
  const probed = outcome !== 'missing';
  if (inMatrix === probed) {
    return undefined;
  }
  // The matrix has no entry for a Web API, so the target takes the Web API data, which names it.
  const source = !inMatrix && webMissing.has(api) ? 'runtime-compat-data' : 'matrix';
  return {
    message: `${source} says \`${inMatrix ? 'present' : 'missing'}\`, probe says \`${outcome}\``,
    dataSaysPresent: inMatrix,
  };
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
