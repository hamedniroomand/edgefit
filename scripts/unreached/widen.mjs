// Widens the range of an entry on its own, when every file that the newest range of a package names
// has the same bytes in the latest release and in the last release of the range. The bytes are the
// only rule. This does not tell a harmless change from a real one, it does not read the releases
// between the two, and it does not read the code in other files that decides whether a file runs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { compareVersions, inRange, semver } from '../../src/data/version-range.ts';

/** @typedef {{ package: string, versions: { min: string, max?: string }, file: string }} Entry */
/**
 * @typedef {object} Widening
 * @property {string} name The package.
 * @property {string} from The max of the entries before.
 * @property {string} to The latest release, the new max.
 * @property {Entry[]} entries The entries that get the new max.
 * @property {string[]} changedFiles The files of the package that differ between the two releases.
 */

/** The most file names that the pull request body gives for one package. */
export const listLimit = 30;

/**
 * The entries whose range ends last. An entry without a max has no end, so the latest release is
 * always in its range. An entry with an earlier end describes an older line of the package.
 * @param {Entry[]} entries
 * @returns {Entry[]}
 */
export function newestRange(entries) {
  const ends = entries.flatMap(entry =>
    entry.versions.max === undefined ? [] : entry.versions.max,
  );
  const newest = ends.reduce((last, end) => (compareVersions(end, last) > 0 ? end : last), ends[0]);
  return entries.filter(entry => entry.versions.max !== undefined && entry.versions.max === newest);
}

/**
 * The bytes of a file, or undefined when no file is at the path. A folder at the path counts as no
 * file. Any other error, such as EACCES, is thrown.
 */
function readFile(file) {
  // Only ENOENT and ENOTDIR give undefined.
  return statSync(file, { throwIfNoEntry: false })?.isFile() ? readFileSync(file) : undefined;
}

/** Whether each file that the entries name exists in both releases, with the same bytes. */
export function namedFilesUnchanged(entries, latestRoot, lastRoot) {
  return [...new Set(entries.map(entry => entry.file))].every(file => {
    const latest = readFile(path.join(latestRoot, file));
    const last = readFile(path.join(lastRoot, file));
    return latest !== undefined && last !== undefined && latest.equals(last);
  });
}

/** The files below a folder, as paths with `/`. Only files count: a link or another entry is skipped. */
function filesBelow(root, folder = '') {
  return readdirSync(path.join(root, folder), { withFileTypes: true }).flatMap(item => {
    const relative = path.posix.join(folder, item.name);
    if (item.isDirectory()) {
      return filesBelow(root, relative);
    }
    return item.isFile() ? relative : [];
  });
}

/** The files that exist in one of the two releases only, or have other bytes in each. */
export function differingFiles(latestRoot, lastRoot) {
  const names = new Set([...filesBelow(latestRoot), ...filesBelow(lastRoot)]);
  return [...names]
    .filter(name => {
      const latest = readFile(path.join(latestRoot, name));
      const last = readFile(path.join(lastRoot, name));
      return latest === undefined || last === undefined || !latest.equals(last);
    })
    .sort();
}

/**
 * What to widen, for the entries of one package in one data file, against the latest release.
 * Nothing in these cases:
 * - The latest release is in a range already, or is below the newest range.
 * - The latest release is a pre-release, which is not a valid max.
 * - A file that the newest range names is missing in one of the two releases, or has other bytes.
 * `fetchRelease(version)` unpacks that release and gives the folder of its files.
 * @param {Entry[]} entries
 * @param {{ version: string, root: string }} latest
 * @param {(version: string) => string} fetchRelease
 * @returns {Widening | undefined}
 */
export function widenPlan(entries, latest, fetchRelease) {
  const range = newestRange(entries);
  if (
    !semver.test(latest.version) ||
    range.length === 0 ||
    entries.some(entry => inRange(latest.version, entry.versions))
  ) {
    return undefined;
  }
  const from = range[0].versions.max ?? '';
  if (compareVersions(latest.version, from) <= 0) {
    return undefined;
  }
  const lastRoot = fetchRelease(from);
  if (!namedFilesUnchanged(range, latest.root, lastRoot)) {
    return undefined;
  }
  return {
    name: range[0].package,
    from,
    to: latest.version,
    entries: range,
    changedFiles: differingFiles(latest.root, lastRoot),
  };
}

/**
 * Sets the new max on the entries in memory, so the check of the latest release passes, as it will
 * when the data files are written.
 * @param {Widening} widening
 */
export function applyWidening(widening) {
  for (const entry of widening.entries) {
    entry.versions.max = widening.to;
  }
}

const packageLine = /^\s*"package": "(.+)",$/u;
const versionsLine = /^\s*"versions": \{ "min": "[^"]+", "max": "([^"]+)" \},$/u;
const fileLine = /^\s*"file": "(.+)",$/u;

/**
 * The text of a data file, with the new max on each widened entry. The other lines stay as they
 * are, so the layout of the file stays as the formatter wrote it.
 * @param {string} text
 * @param {Widening[]} widenings
 */
export function widenedText(text, widenings) {
  const lines = text.split('\n');
  let name;
  let versionsAt;
  let replaced = 0;
  for (const [index, line] of lines.entries()) {
    name = packageLine.exec(line)?.[1] ?? name;
    if (/^\s*"versions": /u.test(line)) {
      versionsAt = versionsLine.test(line) ? index : undefined;
    }
    const file = fileLine.exec(line)?.[1];
    if (file === undefined || versionsAt === undefined) {
      continue;
    }
    const max = versionsLine.exec(lines[versionsAt])?.[1];
    const widening = widenings.find(
      item =>
        item.name === name && item.from === max && item.entries.some(entry => entry.file === file),
    );
    if (widening !== undefined) {
      lines[versionsAt] = lines[versionsAt].replace(`"max": "${max}"`, `"max": "${widening.to}"`);
      replaced += 1;
    }
  }
  const expected = widenings.reduce((sum, item) => sum + item.entries.length, 0);
  if (replaced !== expected) {
    const names = [...new Set(widenings.map(item => item.name))].join(', ');
    throw new Error(
      `Found ${replaced} of ${expected} entries to widen in the text (${names}). The layout of the data file does not match. Widen them by hand.`,
    );
  }
  return lines.join('\n');
}

/** The changeset for the widened ranges: one sentence with each package and its new release. */
export function changesetText(widenings) {
  const releases = [...new Set(widenings.map(item => `\`${item.name}\` ${item.to}`))];
  const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(releases);
  return `---\n'edgefit': patch\n---\n\nAdd the newest releases to the data about code that a target never runs and modules that a package stores: ${list}.\n`;
}

/** The files of one package that differ, as list lines. A name from a package can hold any character. */
function fileLines(files) {
  const shown = files.slice(0, listLimit).map(file => `- \`${file.replaceAll(/[`\r\n]/gu, '?')}\``);
  const more = files.length - shown.length;
  return more > 0 ? [...shown, `- and ${more} more`] : shown;
}

/**
 * The body of the pull request: what the check did, what it did not read, and for each package
 * the files that differ between the two releases.
 * @param {Widening[]} widenings
 */
export function pullRequestBody(widenings) {
  const sections = widenings.map(item =>
    [
      `### ${item.name}: ${item.from} to ${item.to}`,
      '',
      `These files differ between the two releases (${item.changedFiles.length}). The list gives the first ${listLimit} names, in alphabetical order:`,
      '',
      ...fileLines(item.changedFiles),
      '',
      `All the names: \`npm diff --diff=${item.name}@${item.from} --diff=${item.name}@${item.to} --diff-name-only\``,
    ].join('\n'),
  );
  return [
    'The weekly Unreached data check found new releases that are outside the ranges of the data files. For each package below, every file that its newest range names has the same bytes in the new release and in the last release of that range. This change sets `max` of those entries to the new release. It changes no reason and no `source`.',
    'The check compares only the files that the entries name, in two releases: the new one and the last one of the range. It does not read the releases between them. It does not read other files of the package, such as a file that decides whether a named file runs. It does not read the code that `source` points to, and it does not change `source`. Read the diff and the lists below before you merge.',
    ...sections,
  ].join('\n\n');
}
