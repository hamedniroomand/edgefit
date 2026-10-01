const PREVIEW = 6;

// `fs.default.watch` repeats `fs.watch`, and `path` holds itself as `posix` and `win32`.
const collapseRepeats = api =>
  api
    .split('.')
    .filter((segment, index, segments) => segment !== segments[index - 1])
    .join('.');

function canonical(api) {
  const [module, ...path] = api.split('.');
  const pathModule = module === 'path' || module.startsWith('path/');
  const kept = path.filter(
    segment => segment !== 'default' && !(pathModule && ['posix', 'win32'].includes(segment)),
  );
  return [module === 'sys' ? 'util' : pathModule ? 'path' : module, ...kept].join('.');
}

/** Keeps one line for the aliases of an API that have the same result: the plain name if it is there. */
function withoutAliases(disagreements) {
  const kept = new Map();
  for (const item of disagreements) {
    const api = collapseRepeats(item.api);
    const key = `${canonical(api)}|${item.message}`;
    if (!kept.has(key) || api === canonical(api)) {
      kept.set(key, { ...item, api });
    }
  }
  return [...kept.values()];
}

/** The same API under the module's `default` export, which the data records apart from the named ones. */
function defaultMirror(api) {
  const [module, ...path] = api.split('.');
  return [module, 'default', ...path].join('.');
}

const byModule = items => {
  const modules = new Map();
  for (const { api } of items) {
    const [module, ...path] = api.split('.');
    modules.set(module, [...(modules.get(module) ?? []), path.join('.') || '(module)']);
  }
  return [...modules].sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b));
};

function section(title, items) {
  if (items.length === 0) {
    return [];
  }
  const groups = byModule(items).map(([module, members]) => {
    const shown = members.slice(0, PREVIEW).join(', ');
    return `- \`${module}\` (${members.length}): ${shown}${members.length > PREVIEW ? ', …' : ''}`;
  });
  const full = items.map(({ api, message }) => `- \`${api}\`: ${message}`);
  return [
    `### ${title} (${items.length})`,
    ...groups,
    '',
    `<details><summary>Full list</summary>\n\n${full.join('\n')}\n\n</details>`,
    '',
  ];
}

/**
 * The summary lines for where the probe and the curated data disagree: aliases of one result
 * are folded into one line, and the list is split by direction and grouped by module.
 */
export function summarizeDisagreements(disagreements, outcomes) {
  const items = withoutAliases(disagreements);
  const missingAtRuntime = items.filter(item => item.dataSaysPresent);
  // The default export has it: `import stream from 'node:stream'` works, `import { promises }` does not.
  const isNamedOnly = ({ api }) => {
    const outcome = outcomes[defaultMirror(api)];
    return outcome !== undefined && outcome !== 'missing';
  };
  return [
    ...section(
      'Present in the data, missing at runtime (possible false passes)',
      missingAtRuntime.filter(item => !isNamedOnly(item)),
    ),
    ...section(
      'Present in the data, missing as a named export but present on the default export',
      missingAtRuntime.filter(isNamedOnly),
    ),
    ...section(
      'Missing in the data, present at runtime',
      items.filter(item => !item.dataSaysPresent),
    ),
  ];
}
