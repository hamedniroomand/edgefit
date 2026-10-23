// Usage: node run.mjs <edgefit-cli> <out-dir> [shard-index shard-count [previous-dir]]
// Checks this shard's packages one after another. A package that times out or fails to install is
// written as an error result, so one broken package never fails the run. The packages go to the
// shards by the duration of each one in the previous results.json, see shards.mjs. Each result
// holds the milliseconds that its package took, as `durationMs`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { packageArgs } from './args.mjs';
import { fileNameOf, readList } from './list.mjs';
import { dealShards, knownOf, readDurations } from './shards.mjs';

const [cli, out, index = '0', count = '1', previous] = process.argv.slice(2);
const shard = Number(index);
const shards = Number(count);
if (
  !Number.isInteger(shards) ||
  shards < 1 ||
  !Number.isInteger(shard) ||
  shard < 0 ||
  shard >= shards
) {
  throw new Error(`shard ${index} of ${count} is not a shard of a run`);
}
const timeoutMs = 10 * 60 * 1000;
mkdirSync(out, { recursive: true });

const failed = (name, message) => ({
  version: 2,
  package: name,
  resolved: null,
  checkedAt: new Date().toISOString(),
  targets: [],
  summary: {},
  entries: [],
  error: message,
});

const list = readList();
const durations = readDurations(previous);
const plan = dealShards(list, durations, shards);
const byDuration = knownOf(list, durations).length > 0;
console.log(
  `Shard ${index} of ${count}: ${plan.filter(item => item === shard).length} of ${list.length} packages, dealt ${
    byDuration ? 'by the durations of the previous run' : 'in list order'
  }`,
);

list.forEach((entry, position) => {
  if (plan[position] !== shard) {
    return;
  }
  const args = [cli, ...packageArgs(entry)];
  const started = Date.now();
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: timeoutMs });
  const durationMs = Date.now() - started;
  let result;
  try {
    result = JSON.parse(run.stdout);
  } catch {
    const detail = run.error?.message ?? run.stderr.trim().split('\n').slice(-2).join(' ');
    result = failed(entry.name, detail || 'no result');
  }
  if (entry.notes !== undefined) {
    result.notes = entry.notes;
  }
  // A failed or timed-out run is timed too. The merge keeps the earlier duration of a row that
  // keeps its earlier result.
  result.durationMs = durationMs;
  writeFileSync(
    path.join(out, `${fileNameOf(entry.name)}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(`${entry.name}: ${result.error ?? JSON.stringify(result.summary)}`);
});
