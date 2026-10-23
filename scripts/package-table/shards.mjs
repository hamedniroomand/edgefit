// Deals the packages of the table to the shards by the duration of each package in the previous
// results.json. Every shard calls this with the same list and the same previous results, so every
// shard gets the same plan.
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** A duration that a result can hold: a finite number of milliseconds, more than zero. */
const isDuration = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * The milliseconds that each package took in the previous run, by name. A row with no valid
 * duration, such as a row from a run before the durations were recorded, gives none.
 * @param {unknown} results The parsed results.json.
 * @returns {Map<string, number>}
 */
export function durationsOf(results) {
  const rows = Array.isArray(results?.packages) ? results.packages : [];
  return new Map(
    rows
      .filter(row => typeof row?.name === 'string' && isDuration(row.durationMs))
      .map(row => [row.name, row.durationMs]),
  );
}

/**
 * The durations in `results.json` of a folder. A missing folder, a missing file and a path below a
 * file give none, as on a first run or on a fork. Any other error is thrown with the path of the
 * file, so that no shard uses a different input from the other shards.
 * @param {string | undefined} directory
 * @returns {Map<string, number>}
 */
export function readDurations(directory) {
  if (directory === undefined) {
    return durationsOf(undefined);
  }
  const file = path.join(directory, 'results.json');
  try {
    return durationsOf(JSON.parse(readFileSync(file, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return durationsOf(undefined);
    }
    throw new Error(`Cannot read ${file}: ${error.message}`, { cause: error });
  }
}

/** The entries that have a duration. */
export function knownOf(entries, durations) {
  return entries.filter(entry => durations.has(entry.name));
}

/** The middle of a list of numbers, or the mean of the two middle ones when the count is even. The list is not empty. */
export function median(values) {
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The shard of each entry, by its position in the list. The packages go longest first, each to the
 * shard with the smallest sum so far. A package with no duration counts as the median of the known
 * durations. With no known duration, the shard is the position modulo the count, as before the
 * durations existed. Packages with equal durations go in list order. When the sums of two shards
 * are equal, the lower shard gets the package. So the plan has one answer.
 * @param {{ name: string }[]} entries
 * @param {Map<string, number>} durations
 * @param {number} count The number of shards, an integer of 1 or more.
 * @returns {number[]}
 */
export function dealShards(entries, durations, count) {
  const known = knownOf(entries, durations);
  if (known.length === 0) {
    return entries.map((_entry, position) => position % count);
  }
  const typical = median(known.map(entry => durations.get(entry.name)));
  const costs = entries.map(entry => durations.get(entry.name) ?? typical);
  const longestFirst = entries
    .map((_entry, position) => position)
    .toSorted((left, right) => costs[right] - costs[left] || left - right);
  const sums = Array.from({ length: count }, () => 0);
  const plan = [];
  for (const position of longestFirst) {
    const shard = sums.indexOf(Math.min(...sums));
    sums[shard] += costs[position];
    plan[position] = shard;
  }
  return plan;
}
