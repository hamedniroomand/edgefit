// Usage: node merge.mjs <edgefit-dist-index> <shards-dir> <out-dir> [previous-dir]
// Merges every shard's per-package JSON into results.json, writes each package's badge, and
// lists the packages that got worse since the previous run.
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { fileNameOf, readList } from './list.mjs';

const [dist, shards, out, previousDir] = process.argv.slice(2);
const previousFile = previousDir === undefined ? undefined : path.join(previousDir, 'results.json');
const previousRows = new Map(
  previousFile !== undefined && existsSync(previousFile)
    ? JSON.parse(readFileSync(previousFile, 'utf8')).packages.map(row => [row.name, row])
    : [],
);
const stale = [];
const { renderBadge, shieldsEndpoint } = await import(pathToFileURL(path.resolve(dist)).href);

const rank = { pass: 0, unchecked: 0, warn: 1, error: 2, fail: 3 };
mkdirSync(path.join(out, 'packages'), { recursive: true });
mkdirSync(path.join(out, 'badges'), { recursive: true });

const found = new Map();
for (const shard of readdirSync(shards)) {
  const directory = path.join(shards, shard);
  for (const file of readdirSync(directory).filter(name => name.endsWith('.json'))) {
    found.set(file, JSON.parse(readFileSync(path.join(directory, file), 'utf8')));
  }
}

const rows = [];

/**
 * A package that could not be checked this time keeps its last good result and badges, so a
 * transient failure does not break the badges in READMEs. Returns whether it did.
 */
function keepPrevious(name, file, error) {
  const before = previousRows.get(name);
  if (before === undefined || before.error !== undefined) {
    return false;
  }
  // Exact names only: a package name may contain dots, so a prefix match would also copy the
  // old files of another package (`lodash` and `lodash.merge`).
  const kept = [
    `packages/${file}.json`,
    `badges/${file}.svg`,
    `badges/${file}.json`,
    ...Object.keys(before.summary).map(target => `badges/${file}.${target}.svg`),
  ].filter(entry => existsSync(path.join(previousDir, entry)));
  for (const entry of kept) {
    copyFileSync(path.join(previousDir, entry), path.join(out, entry));
  }
  rows.push({ ...before, staleError: error });
  stale.push(`- \`${name}\`: ${error} (kept the result for ${before.resolved})`);
  return true;
}

/** The worst entry of each target, where it is worse than the result of the target, and the worst export. */
function worstColumns({ worst, worstExport }) {
  return {
    ...(worst === undefined || Object.keys(worst).length === 0 ? {} : { worst }),
    ...(worstExport === undefined || Object.keys(worstExport).length === 0 ? {} : { worstExport }),
  };
}

let sample;
for (const { name } of readList()) {
  const file = fileNameOf(name);
  const result = found.get(`${file}.json`);
  if (result === undefined) {
    continue;
  }
  if (result.error !== undefined && keepPrevious(name, file, result.error)) {
    continue;
  }
  sample ??= result.error === undefined ? result : sample;
  writeFileSync(path.join(out, 'packages', `${file}.json`), `${JSON.stringify(result, null, 2)}\n`);
  if (result.error === undefined) {
    writeFileSync(path.join(out, 'badges', `${file}.svg`), renderBadge(result));
    writeFileSync(
      path.join(out, 'badges', `${file}.json`),
      `${JSON.stringify(shieldsEndpoint(result))}\n`,
    );
    for (const target of result.targets) {
      writeFileSync(
        path.join(out, 'badges', `${file}.${target}.svg`),
        renderBadge(result, { target }),
      );
    }
  }
  rows.push({
    name,
    file,
    resolved: result.resolved,
    summary: result.summary,
    subpaths: result.entries.length,
    ...(result.error === undefined && result.main !== undefined ? { main: result.main } : {}),
    ...(result.error === undefined ? worstColumns(result) : {}),
    ...(result.error === undefined ? {} : { error: result.error }),
    ...(result.notes === undefined ? {} : { notes: result.notes }),
  });
}

const results = {
  version: 2,
  generatedAt: new Date().toISOString(),
  edgefit: sample?.edgefit,
  data: sample?.data ?? {},
  targets: sample?.targets ?? [],
  packages: rows,
};
writeFileSync(path.join(out, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);

// Regressions: a target whose status got worse than in the previous run.
const regressions = [];
if (previousFile !== undefined && existsSync(previousFile)) {
  const before = new Map(
    JSON.parse(readFileSync(previousFile, 'utf8')).packages.map(row => [row.name, row]),
  );
  for (const row of rows) {
    for (const [target, status] of Object.entries(row.summary)) {
      const was = before.get(row.name)?.summary?.[target];
      if (was !== undefined && rank[status] > rank[was]) {
        regressions.push(`- \`${row.name}\` on ${target}: ${was} → ${status} (${row.resolved})`);
      }
    }
  }
}
const summary = [
  `## Package table`,
  `${rows.length} packages checked, ${rows.filter(row => row.error !== undefined || row.staleError !== undefined).length} could not be checked this time.`,
  regressions.length === 0 ? 'No regressions.' : `### Regressions\n${regressions.join('\n')}`,
  ...(stale.length === 0
    ? []
    : [`### Could not be checked, previous result kept\n${stale.join('\n')}`]),
].join('\n\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
