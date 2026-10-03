// Checks data/unreached.json and data/stored-modules.json against the latest release of each
// package they name, so an entry that stopped matching, or a release no entry covers, is noticed.
// Run weekly by CI.
// Usage: node scripts/unreached/check.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { inRange, problemsOf } from './entries.mjs';

const files = ['data/unreached.json', 'data/stored-modules.json'];

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
}

function download(name) {
  const version = run('npm', ['view', name, 'version']);
  const directory = mkdtempSync(path.join(tmpdir(), 'unreached-'));
  const tarball = run('npm', [
    'pack',
    `${name}@${version}`,
    '--silent',
    '--pack-destination',
    directory,
  ]);
  run('tar', ['-xzf', path.join(directory, tarball), '-C', directory]);
  return { version, root: path.join(directory, 'package') };
}

const problems = [];
const downloads = new Map();
for (const dataFile of files) {
  const { entries } = JSON.parse(readFileSync(dataFile, 'utf8'));
  for (const name of new Set(entries.map(entry => entry.package))) {
    if (!downloads.has(name)) {
      downloads.set(name, download(name));
    }
    const { version, root } = downloads.get(name);
    const own = entries.filter(entry => entry.package === name);
    // An entry for an older release describes that release, not the latest one.
    for (const entry of own.filter(item => inRange(version, item.versions))) {
      const file = path.join(root, entry.file);
      if (!existsSync(file)) {
        problems.push(`${dataFile}: ${name}@${version}: ${entry.file} no longer exists.`);
        continue;
      }
      const text = readFileSync(file, 'utf8');
      for (const problem of problemsOf(text, entry)) {
        problems.push(`${dataFile}: ${name}@${version}: ${entry.file} ${problem}`);
      }
    }
    if (!own.some(entry => inRange(version, entry.versions))) {
      problems.push(
        `${dataFile}: ${name}@${version} is outside every range. Read the entries against it, then widen the ranges.`,
      );
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.log(`::error title=data::${problem}`);
  }
  process.exit(1);
}
console.log('The data files match the latest release of every package they name.');
