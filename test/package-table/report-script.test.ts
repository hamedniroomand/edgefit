import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { marker } from '@scripts/package-table/report.mjs';
import { afterAll, describe, expect, it } from 'vite-plus/test';

/** The result of a row that fails on workerd, in the shape of `edgefit package --format json`. */
const failing = {
  package: 'p',
  resolved: '1.2.3',
  summary: { workerd: 'fail', bun: 'pass' },
  entries: [
    {
      subpath: '.',
      results: {
        workerd: {
          status: 'fail',
          findings: [{ level: 'error', api: 'node:child_process.spawn' }],
        },
        bun: { status: 'pass' },
      },
    },
  ],
};

const directories: string[] = [];
function folderWith(files: Record<string, string>): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-report-script-'));
  directories.push(directory);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(directory, name), text);
  }
  return directory;
}
afterAll(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const script = path.join(import.meta.dirname, '../../scripts/package-table/report.mjs');

/** Runs the script on a list of rows, the added names and the results of the rows. */
function runScript(
  rows: unknown[],
  names: string,
  results: Record<string, unknown>,
  files: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string; markdown: string } {
  const directory = folderWith({
    'list.json': JSON.stringify({ packages: rows }),
    'added.txt': names,
  });
  const folder = path.join(directory, 'results');
  mkdirSync(folder);
  for (const [name, result] of Object.entries(results)) {
    writeFileSync(path.join(folder, `${name}.json`), JSON.stringify(result));
  }
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(folder, name), text);
  }
  const markdown = path.join(directory, 'comment.md');
  const done = spawnSync(
    process.execPath,
    [script, path.join(directory, 'added.txt'), folder, '--markdown', markdown],
    { encoding: 'utf8', env: { ...process.env, PACKAGE_LIST: path.join(directory, 'list.json') } },
  );
  return { status: done.status, stdout: done.stdout, stderr: done.stderr, markdown };
}

describe('the script for a row', () => {
  it('exits with 1 and names the row for a row that fails and has no notes', () => {
    const done = runScript([{ name: 'p' }], 'p\n', { p: failing });
    expect(done.status).toBe(1);
    expect(done.stdout).toContain(
      '::error title=Package list::p fails on workerd (main entry `.`: `node:child_process.spawn`)',
    );
    expect(readFileSync(done.markdown, 'utf8').startsWith(marker)).toBe(true);
  });

  it('exits with 0 for the same row when it has notes, and still writes the report', () => {
    const done = runScript([{ name: 'p', notes: 'Why.' }], 'p\n', { p: failing });
    expect(done.status).toBe(0);
    expect(done.stdout).toBe('');
    expect(readFileSync(done.markdown, 'utf8')).toContain('| `p@1.2.3` | ✗ | ✓ | yes |');
  });
});

describe('the script with other input', () => {
  it('escapes the text of the error line that it prints', () => {
    const done = runScript([{ name: 'p' }], 'p\n', {}, { 'p.err': 'disk 100% full' });
    expect(done.status).toBe(1);
    expect(done.stdout).toContain('disk 100%25 full');
  });

  it('writes nothing and exits with 0 when no row is added', () => {
    const done = runScript([], '\n', {});
    expect(done.status).toBe(0);
    expect(existsSync(done.markdown)).toBe(false);
  });

  it('exits with 2 and a usage line for a missing argument or a flag with no file', () => {
    expect(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status).toBe(2);
    const dangling = spawnSync(process.execPath, [script, 'a', 'b', '--markdown'], {
      encoding: 'utf8',
    });
    expect(dangling.status).toBe(2);
    expect(dangling.stderr).toContain('Usage: node report.mjs');
  });
});
