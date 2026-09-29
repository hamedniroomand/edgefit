import { implementedMocks } from './compare.mjs';

/** Names the matrix repeats for the global object, so `global.x` and `self.x` are just `x`. */
const GLOBAL_ALIASES = new Set(['global', 'globalThis', 'self']);

// A Node API with one of these baseline types is deprecated, experimental or version-specific.
const UNSTABLE = new Set(['missing', 'undefined', 'null', '<INSPECTION ERROR>']);

const typeOf = node => {
  if (node === undefined) {
    return 'missing';
  }
  if (typeof node === 'string') {
    return node;
  }
  return typeof node['*self*'] === 'string' ? node['*self*'] : 'object';
};

const child = (node, key) =>
  node !== undefined && typeof node === 'object' && Object.hasOwn(node, key)
    ? node[key]
    : undefined;

function collect(base, target, path, overrides, found) {
  if (typeOf(target) === 'missing' && !UNSTABLE.has(typeOf(base))) {
    // Everything below a missing API is missing with it.
    if (!overrides[path.join('.')]) {
      found.add(path.join('.'));
    }
    return;
  }
  if (typeof base !== 'object') {
    return;
  }
  for (const key of Object.keys(base)) {
    const skip = key === '*self*' || (path.join('.') === '*globals*' && GLOBAL_ALIASES.has(key));
    if (!skip) {
      collect(base[key], child(target, key), [...path, key], overrides, found);
    }
  }
}

/**
 * The APIs the runtime's data marks missing although Node has them, which is what edgefit reports
 * as absent. Overridden APIs are left out, and the global object's aliases are counted once.
 */
export function missingApis(runtime, baseline, overrides) {
  const found = new Set();
  for (const [module, base] of Object.entries(baseline)) {
    collect(base, child(runtime, module), [module], overrides, found);
  }
  return [...found].sort();
}

/** `1.20260924.0` is the workerd release of 2026-09-24, the newest compatibility date it accepts. */
export function compatibilityDateFor(version) {
  const match = /^\d+\.(\d{4})(\d{2})(\d{2})\.\d+/u.exec(version);
  return match === null ? undefined : `${match[1]}-${match[2]}-${match[3]}`;
}

/** What the newest release of a runtime says that the pinned data does not. */
export function driftFor({ runtime, pinned, latest, outcomes, mocked, overrides }) {
  // Only `implemented` is evidence: a call that throws an argument error reached real code.
  // `inconclusive` says nothing either way.
  const stubs = Object.keys(outcomes).filter(
    api => overrides[api]?.status === 'unsupported' && outcomes[api] === 'implemented',
  );
  return {
    runtime,
    pinned,
    latest,
    nowPresent: Object.keys(outcomes)
      .filter(api => outcomes[api] === 'present')
      .sort(),
    stubsNowWork: stubs.sort(),
    mocksImplemented: implementedMocks(mocked).sort(),
  };
}

export const hasDrift = drift =>
  drift.nowPresent.length + drift.stubsNowWork.length + drift.mocksImplemented.length > 0;

const list = (title, apis) =>
  apis.length > 0 ? [`**${title}**`, ...apis.map(api => `- \`${api}\``), ''] : [];

export const issueMarker = '<!-- edgefit-data-drift -->';
export const issueTitle = 'The compatibility data is behind the latest runtimes';

/** The issue text for the runtimes that drifted, and whether there is anything to report. */
export function renderIssue(drifts) {
  const changed = drifts.filter(hasDrift);
  const sections = changed.flatMap(drift => [
    `### ${drift.runtime} (pinned ${drift.pinned}, latest ${drift.latest})`,
    '',
    ...list('Marked missing in the data, but present in the latest release', drift.nowPresent),
    ...list('Curated stubs that now work', drift.stubsNowWork),
    ...list('Mocked entries that are now implemented', drift.mocksImplemented),
  ]);
  const body = [
    issueMarker,
    'The pinned compatibility data disagrees with the newest release of these runtimes, so some findings may be out of date. This list is refreshed every week, and the issue closes when the data catches up.',
    '',
    ...sections,
    'To update the data, follow [Bumping a data source](https://hamedniroomand.github.io/edgefit/contributing/data#bumping-a-data-source).',
    '',
  ].join('\n');
  return { body, drift: changed.length > 0 };
}
