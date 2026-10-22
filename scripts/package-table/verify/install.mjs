// Installs one package at the version of its result, and the optional peers that its main entry
// names, with install scripts, in its own folder.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const timeoutMs = 5 * 60 * 1000;
// The note of an optional peer. src/package/check-entry.ts writes the text. If that text changes,
// no peer matches and the run installs none.
const peerNote = /^peer (\S+) not installed, checked in your project$/u;

/** Runs `npm install` with `args` in `directory`. Returns the error text, or `undefined`. */
function npmInstall(directory, args = []) {
  const run = spawnSync(
    'npm',
    ['install', '--no-audit', '--no-fund', '--loglevel=error', ...args],
    { cwd: directory, encoding: 'utf8', timeout: timeoutMs },
  );
  if (run.status === 0) {
    return undefined;
  }
  const detail = run.error?.message ?? run.stderr.trim().split('\n').slice(-2).join(' ');
  return detail || 'no output';
}

/** The peers that the package marks optional, which npm does not install. */
function optionalPeersOf(manifest) {
  return Object.entries(manifest.peerDependenciesMeta ?? {})
    .filter(([, meta]) => meta?.optional === true)
    .map(([peer]) => peer);
}

/**
 * Installs each peer that a note names, with one `npm install` for each, so a peer that fails
 * does not stop the others. A peer gets a version in the range that the package gives for it in
 * `peerDependencies`. Returns the optional peers that are not installed, and a line for each
 * named peer that did not install.
 */
function installPeers(directory, manifest, notes, run) {
  const installed = new Set();
  const failures = [];
  const named = notes.map(note => peerNote.exec(note)?.[1]).filter(peer => peer !== undefined);
  for (const peer of named) {
    const range = manifest.peerDependencies?.[peer];
    const failure =
      range === undefined
        ? 'the package gives no range for it'
        : run(directory, [`${peer}@${range}`]);
    if (failure === undefined) {
      installed.add(peer);
    } else {
      failures.push(`${peer}: ${failure}`);
    }
  }
  const optionalPeers = optionalPeersOf(manifest).filter(peer => !installed.has(peer));
  return { optionalPeers, peerFailures: failures };
}

/**
 * Installs `name@version` in `<work>/<file>/`, then the peers that `notes` name. Returns the
 * folder, the optional peers that are not installed and the peers that did not install, or an
 * error message. `run` is the install command, which a test replaces.
 */
export function install(work, file, name, version, notes = [], run = npmInstall) {
  const directory = path.join(work, file);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module', dependencies: { [name]: version } })}\n`,
  );
  const failure = run(directory);
  if (failure !== undefined) {
    return { error: `npm install failed: ${failure}` };
  }
  const manifest = JSON.parse(
    readFileSync(path.join(directory, 'node_modules', name, 'package.json'), 'utf8'),
  );
  return { directory, ...installPeers(directory, manifest, notes, run) };
}
