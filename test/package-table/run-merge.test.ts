import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterAll, describe, expect, it } from 'vite-plus/test';

const scripts = path.join(import.meta.dirname, '../../scripts/package-table');
const root = mkdtempSync(path.join(tmpdir(), 'edgefit-table-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

type Row = Record<string, unknown>;
let counter = 0;

/** A new folder under the temp root. */
function folder(): string {
  counter += 1;
  const directory = path.join(root, String(counter));
  mkdirSync(directory, { recursive: true });
  return directory;
}

function write(file: string, value: unknown): string {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}

/** The environment of a script, with the list of packages of the test and no CI output files. */
function envFor(list: string): NodeJS.ProcessEnv {
  const { GITHUB_STEP_SUMMARY: _summary, VERIFY_DIR: _verify, ...rest } = process.env;
  return { ...rest, PACKAGE_LIST: list };
}

function listOf(names: string[]): string {
  return write(path.join(folder(), 'packages.json'), { packages: names.map(name => ({ name })) });
}

/** A CLI that answers like `edgefit package`, and fails for the package `broken`. */
const cli = write(
  path.join(root, 'cli.mjs'),
  `const name = process.argv[3];
if (name === 'broken') process.exit(1);
process.stdout.write(JSON.stringify({ version: 2, package: name, resolved: '1.0.0', checkedAt: 'now', targets: ['workerd'], summary: { workerd: 'pass' }, entries: [] }));
`,
);

/** The folder with the previous results.json that holds these rows. */
function previousOf(rows: Row[]): string {
  const directory = folder();
  write(path.join(directory, 'results.json'), { packages: rows });
  return directory;
}

function runShard(list: string, index: number, count: number, previous?: string): string[] {
  const out = folder();
  const args = [path.join(scripts, 'run.mjs'), cli, out, String(index), String(count)];
  const output = execFileSync(
    process.execPath,
    [...args, ...(previous === undefined ? [] : [previous])],
    {
      env: envFor(list),
      encoding: 'utf8',
    },
  );
  expect(output).toContain(`Shard ${index} of ${count}`);
  return readdirSync(out)
    .toSorted()
    .map(file => `${file.replace('.json', '')}@${out}`);
}

const names = (files: string[]): string[] => files.map(file => file.split('@')[0] ?? '');

const list = listOf(['a', 'b', 'c', 'd', 'broken']);
const heavy = (name: string, durationMs: number): Row => ({ name, durationMs });

describe('the dealing of a shard', () => {
  it('deals the packages by the durations of the previous results', () => {
    const previous = previousOf([
      heavy('a', 100_000),
      heavy('b', 10_000),
      heavy('c', 10_000),
      heavy('d', 10_000),
    ]);
    expect(names(runShard(list, 0, 2, previous))).toEqual(['a']);
    expect(names(runShard(list, 1, 2, previous))).toEqual(['b', 'broken', 'c', 'd']);
  });

  it.each([
    ['no previous folder', undefined],
    ['a previous folder with no results.json', folder()],
    ['a previous results.json with no duration', previousOf([{ name: 'a' }])],
    [
      'a previous results.json with subpaths and no duration',
      previousOf([
        { name: 'a', subpaths: 9 },
        { name: 'b', subpaths: 1 },
      ]),
    ],
  ])('deals in list order with %s', (_label, previous) => {
    expect(names(runShard(list, 0, 2, previous))).toEqual(['a', 'broken', 'c']);
    expect(names(runShard(list, 1, 2, previous))).toEqual(['b', 'd']);
  });

  it.each([1, 2, 3, 5, 8])('runs each package on exactly one of %i shards', count => {
    const previous = previousOf([heavy('a', 50_000), heavy('c', 40_000), heavy('d', 1)]);
    const all = Array.from({ length: count }, (_unused, index) =>
      names(runShard(list, index, count, previous)),
    );
    expect(all.flat().toSorted()).toEqual(['a', 'b', 'broken', 'c', 'd']);
  });
});

describe('the log of a shard', () => {
  it('says list order when the previous durations are of packages that are not in the list', () => {
    const previous = previousOf([heavy('removed', 100_000)]);
    const output = execFileSync(
      process.execPath,
      [path.join(scripts, 'run.mjs'), cli, folder(), '0', '2', previous],
      { env: envFor(list), encoding: 'utf8' },
    );
    expect(output).toContain('3 of 5 packages, dealt in list order');
  });

  it('says that it deals by the durations when a listed package has one', () => {
    const previous = previousOf([heavy('a', 100_000)]);
    const output = execFileSync(
      process.execPath,
      [path.join(scripts, 'run.mjs'), cli, folder(), '0', '2', previous],
      { env: envFor(list), encoding: 'utf8' },
    );
    expect(output).toContain('dealt by the durations of the previous run');
  });
});

describe('the output of a shard', () => {
  it('writes the milliseconds of each package, also of a package that fails', () => {
    const out = folder();
    execFileSync(process.execPath, [path.join(scripts, 'run.mjs'), cli, out], {
      env: envFor(list),
    });
    for (const name of ['a', 'broken']) {
      const result = JSON.parse(readFileSync(path.join(out, `${name}.json`), 'utf8')) as Row;
      expect(result.durationMs).toBeGreaterThan(0);
    }
    const failed = JSON.parse(readFileSync(path.join(out, 'broken.json'), 'utf8')) as Row;
    expect(failed.error).toBe('no result');
  });

  it.each([
    ['2', '2'],
    ['-1', '2'],
    ['0', '0'],
    ['0', 'x'],
  ])('stops for shard %s of %s', (index, count) => {
    expect(() =>
      execFileSync(process.execPath, [path.join(scripts, 'run.mjs'), cli, folder(), index, count], {
        env: envFor(list),
        stdio: 'pipe',
      }),
    ).toThrow(/is not a shard of a run/u);
  });
});

/** A result as a shard writes it. */
const resultOf = (name: string, extra: Row = {}): Row => ({
  version: 2,
  package: name,
  resolved: '1.0.0',
  edgefit: '0.0.0',
  data: {},
  targets: ['workerd'],
  summary: { workerd: 'pass' },
  entries: [],
  ...extra,
});

function shardsOf(results: Row[]): string {
  const directory = folder();
  for (const [index, result] of results.entries()) {
    write(path.join(directory, `shard-${index}`, `${String(result.package)}.json`), result);
  }
  return directory;
}

const badges = write(
  path.join(root, 'badges.mjs'),
  "export const renderBadge = () => '<svg/>';\nexport const shieldsEndpoint = () => ({ schemaVersion: 1 });\n",
);

function merge(
  list: string,
  shards: string,
  previous?: string,
): { out: string; output: string; status: number } {
  const out = folder();
  const args = [
    path.join(scripts, 'merge.mjs'),
    badges,
    shards,
    out,
    ...(previous === undefined ? [] : [previous]),
  ];
  try {
    const output = execFileSync(process.execPath, args, { env: envFor(list), encoding: 'utf8' });
    return { out, output, status: 0 };
  } catch (error) {
    const failure = error as { status: number; stdout: string };
    return { out, output: failure.stdout, status: failure.status };
  }
}

describe('the merge of the shards', () => {
  it('keeps the duration of each package in results.json', () => {
    const shards = shardsOf([resultOf('a', { durationMs: 1234 }), resultOf('b')]);
    const { out, status } = merge(listOf(['a', 'b']), shards);
    const rows = (
      JSON.parse(readFileSync(path.join(out, 'results.json'), 'utf8')) as { packages: Row[] }
    ).packages;
    expect(status).toBe(0);
    expect(rows.map(row => row.durationMs)).toEqual([1234, undefined]);
  });

  it('keeps the previous duration of a package that keeps its previous result', () => {
    const previous = previousOf([
      { name: 'a', resolved: '0.9.0', summary: { workerd: 'pass' }, durationMs: 5000 },
    ]);
    const shards = shardsOf([
      resultOf('a', { error: 'timeout', durationMs: 600_000, summary: {} }),
    ]);
    const { out } = merge(listOf(['a']), shards, previous);
    const [row] = (
      JSON.parse(readFileSync(path.join(out, 'results.json'), 'utf8')) as { packages: Row[] }
    ).packages;
    expect(row).toMatchObject({ name: 'a', durationMs: 5000, staleError: 'timeout' });
  });

  it('fails and names each listed package that no shard checked', () => {
    const shards = shardsOf([resultOf('a')]);
    const { out, output, status } = merge(listOf(['a', 'b', 'c']), shards);
    expect(status).toBe(1);
    expect(output).toContain('No shard checked these packages: b, c.');
    expect(existsSync(path.join(out, 'results.json'))).toBe(false);
  });
});
