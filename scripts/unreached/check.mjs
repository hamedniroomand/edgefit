// Checks data/unreached.json and data/stored-modules.json against the latest release of each
// package they name, so an entry that stopped matching, or a release no entry covers, is noticed.
// When every file that the newest range of a package names, and every file that those entries list
// in `guards`, has the same bytes in the latest release and in the last release of the range, the
// check widens the range itself, see widen.mjs. It writes the data files and a changeset in the
// current folder, so run it in a clean working tree. When PR_BODY_FILE is set, it also writes the
// body of the pull request to that file. The weekly workflow opens that pull request.
// Run weekly by CI.
// Usage: node scripts/unreached/check.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { inRange, problemsOf } from './entries.mjs';
import {
  applyWidening,
  changedGuards,
  changesetText,
  guardNote,
  missingGuards,
  pullRequestBody,
  widenPlan,
  widenedText,
} from './widen.mjs';

const files = ['data/unreached.json', 'data/stored-modules.json'];

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
}

/**
 * Downloads a release of a package into `directory`, unpacks it, then deletes the tarball. Without
 * a `requested` version it is the latest release.
 */
function download(name, directory, requested) {
  const version = requested ?? run('npm', ['view', name, 'version']);
  mkdirSync(directory, { recursive: true });
  const tarball = run('npm', [
    'pack',
    `${name}@${version}`,
    '--silent',
    '--pack-destination',
    directory,
  ]);
  // A relative name: GNU tar on Windows reads `C:\…` as a remote host.
  run('tar', ['-xzf', tarball], directory);
  remove(path.join(directory, tarball));
  return { version, root: path.join(directory, 'package') };
}

/**
 * The problems of the entries of one data file for one package, against its latest release.
 * `guardChange` names the guard files that kept a range from widening, see `changedGuards`.
 */
function problemsFor(dataFile, entries, name, { version, root }, guardChange) {
  const problems = [];
  // An entry for an older release describes that release, not the latest one.
  for (const entry of entries.filter(item => inRange(version, item.versions))) {
    for (const guard of missingGuards(root, entry)) {
      problems.push(
        `${dataFile}: ${name}@${version}: ${guard} is not a file in this release. It is a guard file of ${entry.file}. Find the file that holds the condition now, and change \`guards\` of the entry.`,
      );
    }
    const file = path.join(root, entry.file);
    // Only ENOENT and ENOTDIR give undefined. Any other error, such as EACCES, is thrown.
    if (statSync(file, { throwIfNoEntry: false }) === undefined) {
      problems.push(`${dataFile}: ${name}@${version}: ${entry.file} no longer exists.`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    for (const problem of problemsOf(text, entry)) {
      problems.push(`${dataFile}: ${name}@${version}: ${entry.file} ${problem}`);
    }
  }
  if (!entries.some(entry => inRange(version, entry.versions))) {
    problems.push(
      `${dataFile}: ${name}@${version} is outside every range. Read the entries against it, then widen the ranges.${guardNote(guardChange)}`,
    );
  }
  // Two entries of one file, such as the workerd and bun entries, can give the same problem.
  return [...new Set(problems)];
}

/** Deletes a file or folder. A failure only gives a warning, so it does not hide the result or an error. */
function remove(target) {
  try {
    rmSync(target, { recursive: true, force: true, maxRetries: 3 });
  } catch (error) {
    console.warn(`Cannot delete a temp file: ${error.message}`);
  }
}

const data = files.map(dataFile => {
  const { entries } = JSON.parse(readFileSync(dataFile, 'utf8'));
  return { dataFile, entries, names: [...new Set(entries.map(entry => entry.package))] };
});
const problems = new Map(data.map(({ dataFile }) => [dataFile, new Map()]));
const widenings = [];

// A Ctrl-C or another stop signal can leave the temp folder, with the files of the current package.
const downloads = mkdtempSync(path.join(tmpdir(), 'unreached-'));
try {
  const names = [...new Set(data.flatMap(item => item.names))];
  for (const [index, name] of names.entries()) {
    // One package at a time: each one is deleted before the next one is downloaded.
    const directory = path.join(downloads, String(index));
    const release = download(name, directory);
    const lastReleases = new Map();
    // The same last release serves the widening and the sentence about guard files.
    const fetchLast = version => {
      if (!lastReleases.has(version)) {
        const lastDirectory = mkdtempSync(path.join(downloads, 'last-'));
        lastReleases.set(version, {
          lastDirectory,
          root: download(name, lastDirectory, version).root,
        });
      }
      return lastReleases.get(version).root;
    };
    for (const { dataFile, entries } of data) {
      const own = entries.filter(entry => entry.package === name);
      if (own.length > 0) {
        const widening = widenPlan(own, release, fetchLast);
        if (widening !== undefined) {
          widenings.push({ dataFile, ...widening });
          applyWidening(widening);
        }
        const guardChange =
          widening === undefined ? changedGuards(own, release, fetchLast) : undefined;
        problems.get(dataFile).set(name, problemsFor(dataFile, own, name, release, guardChange));
      }
    }
    remove(directory);
    for (const { lastDirectory } of lastReleases.values()) {
      remove(lastDirectory);
    }
  }
} finally {
  remove(downloads);
}

/**
 * Writes the widened data files and a changeset, and the pull request body when PR_BODY_FILE is
 * set. It edits every data file before it writes one, so a data file that it cannot edit leaves
 * no file changed.
 */
function writeWidenings() {
  if (widenings.length === 0) {
    return;
  }
  const dataFiles = [...new Set(widenings.map(item => item.dataFile))];
  const texts = dataFiles.map(dataFile =>
    widenedText(
      readFileSync(dataFile, 'utf8'),
      widenings.filter(item => item.dataFile === dataFile),
    ),
  );
  for (const [index, dataFile] of dataFiles.entries()) {
    writeFileSync(dataFile, texts[index]);
  }
  // The minute is part of the name, so a second run does not replace the changeset of the first.
  const stamp = new Date().toISOString().slice(0, 16).replaceAll(/\D/gu, '');
  writeFileSync(`.changeset/unreached-ranges-${stamp}.md`, changesetText(widenings));
  if (process.env.PR_BODY_FILE) {
    writeFileSync(process.env.PR_BODY_FILE, pullRequestBody(widenings));
  }
  for (const { dataFile, name, from, to } of widenings) {
    console.log(
      `::notice title=data::${dataFile}: ${name} ${from} to ${to}: every named file and guard file has the same bytes in both releases, so the range is widened.`,
    );
  }
}

const found = data.flatMap(({ dataFile, names }) =>
  names.flatMap(name => problems.get(dataFile).get(name) ?? []),
);
if (found.length > 0) {
  for (const problem of found) {
    console.log(`::error title=data::${problem}`);
  }
  process.exitCode = 1;
} else {
  console.log('The data files match the latest release of every package they name.');
}
writeWidenings();
