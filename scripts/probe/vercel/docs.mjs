import { createHash } from 'node:crypto';

/** A section's lines: from its heading to the next heading of the same or a higher level. */
export function section(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex(line => line.trim() === heading);
  if (start === -1) {
    return [];
  }
  const level = /^#+/u.exec(heading)[0].length;
  const end = lines.findIndex(
    (line, index) => index > start && /^#+ /u.test(line) && /^#+/u.exec(line)[0].length <= level,
  );
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

/** Table rows whose first cell starts with a backticked name, as `[name, restOfRow]`. */
function rows(lines) {
  return lines.flatMap(line => {
    const match = /^\|\s*(?:\[)?`([^`]+)`(?:\]\([^)]*\))?\s*\|(.*)\|\s*$/u.exec(line);
    return match === null ? [] : [[match[1], match[2].trim()]];
  });
}

/** Links and spacing do not change what a description says. */
export function normalize(text) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

export const hash = text => createHash('sha256').update(normalize(text)).digest('hex').slice(0, 16);

/** `new Function(evalString)` is listed as a call; the data names the API without arguments. */
const withoutCall = name => name.replace(/\(.*\)$/u, '');

/**
 * What Vercel's Edge Runtime page lists: the Web APIs, the Node.js modules with a hash of each
 * description, and the disabled language features.
 */
export function parseEdgeDocs(markdown) {
  const lastUpdated = /^last_updated:\s*(\S+)/mu.exec(markdown)?.[1];
  return {
    lastUpdated,
    globals: [
      ...new Set(rows(section(markdown, '## Edge Runtime supported APIs')).map(([n]) => n)),
    ],
    modules: Object.fromEntries(
      rows(section(markdown, '## Compatible Node.js modules')).map(([name, text]) => [
        name,
        hash(text),
      ]),
    ),
    blocked: [
      ...new Set(rows(section(markdown, '## Unsupported APIs')).map(([n]) => withoutCall(n))),
    ],
  };
}

const added = (docs, data) => docs.filter(name => !data.includes(name)).sort();
const removed = (docs, data) => data.filter(name => !docs.includes(name)).sort();

/**
 * Where the page and the data disagree. `allowlist` and `overrides` are the parsed data files.
 * A changed description is reported so a person re-reads it: the member lists for `async_hooks`
 * and `util` come from those sentences.
 */
export function compareDocs(parsed, allowlist, overrides) {
  // The page says Buffer is exposed in a sentence, not a table row.
  const dataGlobals = allowlist.globals.filter(name => name !== 'Buffer');
  const dataModules = Object.keys(allowlist.modules);
  // The data names a call of the Function constructor `Function.(string)`; the page says `new Function`.
  const dataBlocked = [...Object.keys(overrides.apis), ...overrides.notModelled].map(name =>
    name.replace(/^\*globals\*\./u, '').replace(/^Function\.\(string\)$/u, 'new Function'),
  );
  const docsModules = Object.keys(parsed.modules);
  const changedDescriptions = docsModules.filter(
    name =>
      allowlist.docs.moduleDescriptions[name] !== undefined &&
      allowlist.docs.moduleDescriptions[name] !== parsed.modules[name],
  );
  return [
    ['Web APIs the page lists that the data does not', added(parsed.globals, dataGlobals)],
    ['Web APIs in the data that the page no longer lists', removed(parsed.globals, dataGlobals)],
    ['Node.js modules the page lists that the data does not', added(docsModules, dataModules)],
    [
      'Node.js modules in the data that the page no longer lists',
      removed(docsModules, dataModules),
    ],
    [
      'Node.js modules whose description changed (re-read it, then update the hash)',
      changedDescriptions,
    ],
    ['Disabled features the page lists that the data does not', added(parsed.blocked, dataBlocked)],
    [
      'Disabled features in the data that the page no longer lists',
      removed(parsed.blocked, dataBlocked),
    ],
  ]
    .filter(([, items]) => items.length > 0)
    .map(([title, items]) => ({ title, items }));
}
