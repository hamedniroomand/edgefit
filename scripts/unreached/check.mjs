// Checks data/unreached.json against the latest release of each package it names, so an entry
// that stopped matching, or a release no entry covers, is noticed. Run weekly by CI.
// Usage: node scripts/unreached/check.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const { entries } = JSON.parse(readFileSync('data/unreached.json', 'utf8'));

function compare(left, right) {
  const [a, b] = [left, right].map(version => version.split('.').map(Number));
  return a.reduce((order, part, index) => order || part - (b[index] ?? 0), 0);
}

const inRange = (version, { min, max }) => compare(version, min) >= 0 && compare(version, max) <= 0;

/** The text to look for in a file: the API as the code writes it. */
const needle = api => api.replace(/^node:/u, '');

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
for (const name of new Set(entries.map(entry => entry.package))) {
  const { version, root } = download(name);
  const own = entries.filter(entry => entry.package === name);
  // An entry for an older release describes that release, not the latest one.
  for (const entry of own.filter(item => inRange(version, item.versions))) {
    const file = path.join(root, entry.file);
    if (!existsSync(file)) {
      problems.push(`${name}@${version}: ${entry.file} no longer exists.`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    for (const api of entry.apis.filter(api => !text.includes(needle(api)))) {
      problems.push(`${name}@${version}: ${entry.file} no longer uses ${api}.`);
    }
  }
  if (!own.some(entry => inRange(version, entry.versions))) {
    problems.push(
      `${name}@${version} is outside every range in data/unreached.json. Read the entries against it, then widen the ranges.`,
    );
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.log(`::error title=data/unreached.json::${problem}`);
  }
  process.exit(1);
}
console.log('data/unreached.json matches the latest release of every package it names.');
