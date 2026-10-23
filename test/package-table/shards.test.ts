import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { dealShards, durationsOf, median, readDurations } from '@scripts/package-table/shards.mjs';
import { afterAll, describe, expect, it } from 'vite-plus/test';

type Pairs = [string, number][];
const entriesOf = (count: number): { name: string }[] =>
  Array.from({ length: count }, (_unused, i) => ({ name: `p${i}` }));
const pairsOf = (values: number[]): Pairs => values.map((value, index) => [`p${index}`, value]);
const weightsFor = (values: number[]): Map<string, number> => new Map(pairsOf(values));

/** The sum of the weights of each shard, and the packages that each shard got. */
function shardsOf(
  plan: number[],
  weights: Map<string, number>,
  count: number,
): { sums: number[]; packages: string[][] } {
  const sums = Array.from({ length: count }, () => 0);
  const packages = Array.from({ length: count }, () => [] as string[]);
  for (const [position, shard] of plan.entries()) {
    sums[shard] = (sums[shard] ?? 0) + (weights.get(`p${position}`) ?? 0);
    packages[shard]?.push(`p${position}`);
  }
  return { sums, packages };
}

/** A fixed list of numbers that looks random, so a failure can be run again. */
function numbers(seed: number, length: number): number[] {
  let state = seed;
  return Array.from({ length }, () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return 1 + Math.floor((state / 2_147_483_648) ** 3 * 600_000);
  });
}

describe('dealing the packages to the shards by their durations', () => {
  const durations = [360_000, 300_000, 180_000, 120_000, 90_000, 60_000, 60_000, 30_000, 20_000];
  const weights = weightsFor([...durations, ...Array.from({ length: 30 }, () => 15_000)]);
  const entries = entriesOf(weights.size);

  it('gives each package to exactly one shard, and no shard more than the largest duration plus the total divided by the shards', () => {
    const plan = dealShards(entries, weights, 8);
    const { sums, packages } = shardsOf(plan, weights, 8);
    expect(packages.flat().toSorted()).toEqual(entries.map(entry => entry.name).toSorted());
    const total = [...weights.values()].reduce((sum, value) => sum + value, 0);
    expect(Math.max(...sums)).toBeLessThanOrEqual(Math.max(...weights.values()) + total / 8);
  });

  it('puts the heaviest package alone on a shard when the others together are lighter', () => {
    const plan = dealShards(entriesOf(5), weightsFor([100, 10, 10, 10, 10]), 2);
    expect(plan).toEqual([0, 1, 1, 1, 1]);
  });

  it('gives the same plan for the same input, in any order of the weights', () => {
    const reversed = new Map([...weights].reverse());
    expect(dealShards(entries, reversed, 8)).toEqual(dealShards(entries, weights, 8));
  });

  it('deals a heavy package that is last in the list before the light ones', () => {
    const light = weightsFor([1, 1, 1, 1, 10]);
    const plan = dealShards(entriesOf(5), light, 2);
    expect(plan).toEqual([1, 1, 1, 1, 0]);
    expect(Math.max(...shardsOf(plan, light, 2).sums)).toBe(10);
  });

  it('gives each package its own shard when there are more shards than packages', () => {
    const plan = dealShards(entriesOf(3), weightsFor([3, 2, 1]), 8);
    expect(plan).toEqual([0, 1, 2]);
  });

  it('breaks a tie by the position in the list, and by the lower shard', () => {
    expect(dealShards(entriesOf(4), weightsFor([7, 7, 7, 7]), 3)).toEqual([0, 1, 2, 0]);
  });
});

describe('dealing for random durations', () => {
  it.each([1, 3, 8])(
    'holds the bound and gives each package one shard at %i shards for random durations',
    count => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const values = numbers(seed, 60 + seed);
        const known = new Map(pairsOf(values).filter((_row, i) => i % 7 !== 0));
        const list = entriesOf(values.length);
        const plan = dealShards(list, known, count);
        const typical = median([...known.values()]);
        const filled = new Map(
          list.map((entry): [string, number] => [entry.name, known.get(entry.name) ?? typical]),
        );
        const { sums, packages } = shardsOf(plan, filled, count);
        expect(packages.flat()).toHaveLength(list.length);
        expect(new Set(packages.flat()).size).toBe(list.length);
        const total = sums.reduce((sum, value) => sum + value, 0);
        expect(Math.max(...sums)).toBeLessThanOrEqual(Math.max(...filled.values()) + total / count);
        expect(dealShards(list, new Map(known), count)).toEqual(plan);
      }
    },
  );
});

describe('a package with no duration', () => {
  it('counts as the median of the others, so it runs once and weighs a middle package', () => {
    const known = weightsFor([9, 1, 5]);
    const withNew = dealShards(entriesOf(4), known, 2);
    const asMedian = dealShards(entriesOf(4), new Map([...known, ['p3', 5]]), 2);
    expect(withNew).toEqual(asMedian);
    expect(withNew).toHaveLength(4);
  });

  it('is the middle value, or the mean of the two middle values', () => {
    expect(median([5, 1, 9])).toBe(5);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([4])).toBe(4);
  });

  it.each([1, 2, 3, 8])(
    'is dealt by its position at %i shards when no package has a duration',
    count => {
      expect(dealShards(entriesOf(10), new Map(), count)).toEqual(
        Array.from({ length: 10 }, (_unused, position) => position % count),
      );
    },
  );
});

describe('the durations of the previous results', () => {
  const rows = [
    { name: 'a', durationMs: 1200, subpaths: 3 },
    { name: 'b', subpaths: 7 },
    { name: 'c', durationMs: 0 },
    { name: 'd', durationMs: -5 },
    { name: 'e', durationMs: Number.NaN },
    { name: 'f', durationMs: '900' },
    { durationMs: 100 },
  ];

  it('takes a duration that is a number of milliseconds above zero, and no other value', () => {
    expect([...durationsOf({ packages: rows })]).toEqual([['a', 1200]]);
  });

  it.each([undefined, null, {}, { packages: 'a' }, { packages: [null, 5, 'x'] }])(
    'gives none for the results %j',
    results => {
      expect(durationsOf(results)).toEqual(new Map());
    },
  );
});

describe('reading the previous results from a folder', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-shards-'));
  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const folder = (name: string, text?: string): string => {
    const target = path.join(directory, name);
    mkdirSync(target);
    if (text !== undefined) {
      writeFileSync(path.join(target, 'results.json'), text);
    }
    return target;
  };

  it('gives none for no folder, a folder with no file, and a path below a file', () => {
    expect(readDurations()).toEqual(new Map());
    expect(readDurations(folder('empty'))).toEqual(new Map());
    expect(readDurations(path.join(folder('with-file', '{}'), 'results.json'))).toEqual(new Map());
  });

  it('reads the durations of a file', () => {
    const target = folder('good', JSON.stringify({ packages: [{ name: 'a', durationMs: 5000 }] }));
    expect(readDurations(target)).toEqual(new Map([['a', 5000]]));
  });

  it('throws with the path for a results.json that cannot be read, such as a folder', () => {
    const target = folder('unreadable');
    mkdirSync(path.join(target, 'results.json'));
    expect(() => readDurations(target)).toThrow(/Cannot read .*results\.json: EISDIR/u);
  });

  it('throws with the path for a file that is not JSON', () => {
    expect(() => readDurations(folder('broken', '{ not json'))).toThrow(
      /Cannot read .*results\.json: .*JSON/u,
    );
  });
});
