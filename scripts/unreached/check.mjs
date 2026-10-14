// Checks data/unreached.json and data/stored-modules.json against the latest release of each
// package they name, so an entry that stopped matching, or a release no entry covers, is noticed.
// Run weekly by CI.
// Usage: node scripts/unreached/check.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { inRange, problemsOf } from './entries.mjs';

const files = ['data/unreached.json', 'data/stored-modules.json'];

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
}

/** Downloads the latest release of a package into `directory`, unpacks it, then deletes the tarball. */
function download(name, directory) {
  const version = run('npm', ['view', name, 'version']);
  mkdirSync(directory);
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

/** The problems of the entries of one data file for one package, against its latest release. */
function problemsFor(dataFile, entries, name, { version, root }) {
  const problems = [];
  // An entry for an older release describes that release, not the latest one.
  for (const entry of entries.filter(item => inRange(version, item.versions))) {
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
      `${dataFile}: ${name}@${version} is outside every range. Read the entries against it, then widen the ranges.`,
    );
  }
  return problems;
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

// A Ctrl-C or another stop signal can leave the temp folder, with the files of the current package.
const downloads = mkdtempSync(path.join(tmpdir(), 'unreached-'));
try {
  const names = [...new Set(data.flatMap(item => item.names))];
  for (const [index, name] of names.entries()) {
    // One package at a time: each one is deleted before the next one is downloaded.
    const directory = path.join(downloads, String(index));
    const release = download(name, directory);
    for (const { dataFile, entries } of data) {
      const own = entries.filter(entry => entry.package === name);
      if (own.length > 0) {
        problems.get(dataFile).set(name, problemsFor(dataFile, own, name, release));
      }
    }
    remove(directory);
  }
} finally {
  remove(downloads);
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
