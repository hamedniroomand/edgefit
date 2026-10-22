// Usage: node merge.mjs <edgefit-dist-index> <shards-dir> <out-dir> [previous-dir]
// Merges every shard's per-package JSON into results.json, writes each package's badge, and
// lists the packages that got worse since the previous run. With VERIFY_DIR set, it adds the
// outcome of each verify job that ran the same version. It fails when a listed package has no
// shard output. Each row keeps the `durationMs` that the shards use for the next plan.
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
import { readVerify, verifiedOf, verifiedRow } from './verify/fields.mjs';

const [dist, shards, out, previousDir] = process.argv.slice(2);
const previousFile = previousDir === undefined ? undefined : path.join(previousDir, 'results.json');
const previousRows = new Map(
  previousFile !== undefined && existsSync(previousFile)
    ? JSON.parse(readFileSync(previousFile, 'utf8')).packages.map(row => [row.name, row])
    : [],
);
const stale = [];
const verifyRuns = readVerify(process.env.VERIFY_DIR);
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

// A listed package that has no shard output is lost from the table. This happens when the shards
// dealt different plans, or when an output is missing. The merge stops, so the publish job does
// not change the branch.
const unchecked = readList()
  .map(({ name }) => name)
  .filter(name => !found.has(`${fileNameOf(name)}.json`));
if (unchecked.length > 0) {
  console.log(
    `::error title=package table::No shard checked these packages: ${unchecked.join(', ')}. The results branch stays as it was. Run the Package table workflow again.`,
  );
  process.exit(1);
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
  // The row keeps the duration of its last good run, also after a timeout. A run that fails after
  // a few seconds must not make the package light.
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
  if (result.error !== undefined && keepPrevious(name, file, result.error)) {
    continue;
  }
  sample ??= result.error === undefined ? result : sample;
  const verified =
    result.error === undefined
      ? verifiedOf(verifyRuns.get(file) ?? [], result.resolved)
      : undefined;
  if (verified !== undefined) {
    result.verified = verified;
  }
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
    ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs }),
    ...(verified === undefined ? {} : { verified: verifiedRow(verified) }),
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
