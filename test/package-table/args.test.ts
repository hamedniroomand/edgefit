import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { packageArgs } from '@scripts/package-table/args.mjs';
import { afterAll, describe, expect, it } from 'vite-plus/test';

const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-args-'));
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('the arguments of edgefit package for a row', () => {
  it('asks for JSON for a row with no other field', () => {
    expect(packageArgs({ name: 'p' })).toEqual(['package', 'p', '--format', 'json']);
  });

  it('adds a --skip for each skipped subpath, in the order of the row', () => {
    expect(packageArgs({ name: '@s/p', skip: ['./a', './b'] })).toEqual([
      'package',
      '@s/p',
      '--format',
      'json',
      '--skip',
      './a',
      '--skip',
      './b',
    ]);
  });

  it('adds --main after the skipped subpaths', () => {
    expect(packageArgs({ name: 'p', skip: ['./a'], main: './app' })).toEqual([
      'package',
      'p',
      '--format',
      'json',
      '--skip',
      './a',
      '--main',
      './app',
    ]);
  });
});

describe('the command of the arguments', () => {
  const script = path.join(import.meta.dirname, '../../scripts/package-table/args.mjs');
  const list = path.join(directory, 'list.json');
  writeFileSync(list, JSON.stringify({ packages: [{ name: 'p', skip: ['./a'], main: './app' }] }));
  const run = (name: string): SpawnSyncReturns<string> =>
    spawnSync(process.execPath, [script, name], {
      encoding: 'utf8',
      env: { ...process.env, PACKAGE_LIST: list },
    });

  it('prints the arguments of a row, one for each line', () => {
    const done = run('p');
    expect(done.status).toBe(0);
    expect(done.stdout.trim().split('\n')).toEqual(
      packageArgs({ name: 'p', skip: ['./a'], main: './app' }),
    );
  });

  it('exits with 2 for a name that is not a row', () => {
    const done = run('other');
    expect(done.status).toBe(2);
    expect(done.stderr).toContain('other is not a row of table/packages.json');
  });
});
