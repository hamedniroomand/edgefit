import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { escapeCommand, problemsOf, reportOf, resultOf } from '@scripts/package-table/report.mjs';
import { afterAll, describe, expect, it } from 'vite-plus/test';

type Status = 'pass' | 'warn' | 'fail' | 'error' | 'unchecked';
type Cell = { status: Status; findings?: { level: string; api: string }[]; message?: string };
type Entry = { subpath: string; results: Record<string, Cell> };

type Result = {
  package: string;
  resolved: string;
  summary: Record<string, Status>;
  entries: Entry[];
};

/** The result of `edgefit package --format json`, with the summary and the entries that a test needs. */
function resultFor(summary: Record<string, Status>, entries: Entry[] = []): Result {
  return { package: 'p', resolved: '1.2.3', summary, entries };
}

const spawn = { level: 'error', api: 'node:child_process.spawn' };
const failing = resultFor({ workerd: 'fail', bun: 'pass' }, [
  {
    subpath: '.',
    results: { workerd: { status: 'fail', findings: [spawn] }, bun: { status: 'pass' } },
  },
]);

const directories: string[] = [];
function folderWith(files: Record<string, string>): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-report-'));
  directories.push(directory);
  mkdirSync(directory, { recursive: true });
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

describe('the rule for a row that fails', () => {
  it('names the target, the main entry and the error when the row has no notes', () => {
    expect(problemsOf(failing, {})).toEqual([
      'fails on workerd (main entry `.`: `node:child_process.spawn`) and the row has no notes. Add a notes field that says why.',
    ]);
  });

  it('accepts the same result when the row has notes', () => {
    expect(problemsOf(failing, { notes: 'It spawns a process.' })).toEqual([]);
  });

  it('counts blank notes, and notes that are not text, as no notes', () => {
    expect(problemsOf(failing, { notes: '   ' })).toHaveLength(1);
    expect(problemsOf(failing, { notes: 42 })).toHaveLength(1);
  });

  it('reports each target that fails', () => {
    const both = resultFor({ workerd: 'fail', bun: 'fail', deno: 'pass' });
    expect(problemsOf(both, {})).toHaveLength(2);
  });

  it.each(['error', 'unchecked', 'weird'] as const)('fails a row with the status %s', status => {
    const result = resultFor({ workerd: status as Status });
    expect(problemsOf(result, {})).toEqual([
      expect.stringContaining('cannot be checked on workerd'),
    ]);
    expect(problemsOf(result, { notes: 'why' })).toEqual([]);
  });
});

describe('the cell that the rule reads', () => {
  it('accepts a warning and a pass', () => {
    expect(problemsOf(resultFor({ workerd: 'warn', bun: 'pass' }), {})).toEqual([]);
  });

  it('does not fail a row for a subpath that fails when the main entry passes', () => {
    const hono = resultFor({ workerd: 'pass' }, [
      { subpath: '.', results: { workerd: { status: 'pass' } } },
      { subpath: './bun', results: { workerd: { status: 'fail', findings: [spawn] } } },
    ]);
    expect(problemsOf(hono, {})).toEqual([]);
  });

  it('names the main subpath of the row', () => {
    const result = resultFor({ workerd: 'fail' }, [
      { subpath: './server', results: { workerd: { status: 'fail', findings: [spawn] } } },
    ]);
    expect(problemsOf(result, { main: './server' })[0]).toContain(
      '(main entry `./server`: `node:child_process.spawn`)',
    );
  });

  it('gives the message of a main entry that threw', () => {
    const result = resultFor({ workerd: 'error' }, [
      { subpath: '.', results: { workerd: { status: 'error', message: 'install failed' } } },
    ]);
    expect(problemsOf(result, {})[0]).toContain('(main entry `.`: `install failed`)');
  });
});

describe('the cell that decides the mark', () => {
  it('names the subpath that decides when the main entry could not be checked', () => {
    const result = resultFor({ workerd: 'fail' }, [
      { subpath: '.', results: { workerd: { status: 'unchecked', message: 'needs "react"' } } },
      { subpath: './x', results: { workerd: { status: 'fail', findings: [spawn] } } },
    ]);
    const [problem] = problemsOf(result, {});
    expect(problem).toContain('fails on workerd (`./x`: `node:child_process.spawn`)');
    expect(problem).toContain('no checked main entry `.`');
    expect(problem).toContain('A main field can name the entry');
  });

  it('says that no entry could be checked, with the first message', () => {
    const unchecked = { status: 'unchecked' as const, message: 'needs "react"' };
    const result = resultFor({ workerd: 'error' }, [
      { subpath: './a', results: { workerd: unchecked } },
      { subpath: './b', results: { workerd: unchecked } },
    ]);
    const [problem] = problemsOf(result, {});
    expect(problem).toContain(
      'cannot be checked on workerd (no entry could be checked, such as `./a`: `needs "react"`)',
    );
    expect(problem).not.toContain('A main field');
  });

  it('names the worst subpath when the row has no main entry', () => {
    const result = resultFor({ workerd: 'fail' }, [
      { subpath: './a', results: { workerd: { status: 'fail', findings: [spawn] } } },
    ]);
    expect(problemsOf(result, {})[0]).toContain(
      'fails on workerd (`./a`: `node:child_process.spawn`)',
    );
  });

  it('shows at most three APIs, and counts the rest', () => {
    const findings = ['a', 'b', 'c', 'd', 'e'].map(api => ({ level: 'error', api }));
    const result = resultFor({ workerd: 'fail' }, [
      { subpath: '.', results: { workerd: { status: 'fail', findings } } },
    ]);
    expect(problemsOf(result, {})[0]).toContain('`a`, `b`, `c`, and 2 more)');
  });
});

describe('the result files', () => {
  const advice =
    'A notes field cannot clear this. Run the job again, and open an issue if it fails again.';

  it('reads a result, and gives a problem for a missing, empty or invalid file', () => {
    const directory = folderWith({
      'a.json': JSON.stringify(failing),
      'c.json': '',
      'd.json': 'not json',
      'e.json': '{"summary": 3}',
      'f.err': 'first\nsecond\nthird\nfourth',
    });
    expect(resultOf(directory, 'a')).toEqual({ result: failing });
    expect(resultOf(directory, 'b')).toEqual({ problem: `edgefit gave no result. ${advice}` });
    expect(resultOf(directory, 'c')).toEqual({ problem: `edgefit gave no result. ${advice}` });
    expect(resultOf(directory, 'd')).toEqual({ problem: `the result is not JSON. ${advice}` });
    expect(resultOf(directory, 'e')).toEqual({ problem: `the result has no summary. ${advice}` });
    expect(resultOf(directory, 'f')).toEqual({
      problem: `edgefit gave no result. \`second third fourth\` ${advice}`,
    });
  });

  it('gives a problem for the error result that the runner of the table writes', () => {
    const result = { summary: {}, entries: [], error: 'timed out' };
    const directory = folderWith({ 'a.json': JSON.stringify(result) });
    expect(resultOf(directory, 'a')).toEqual({
      problem: `edgefit could not check it: timed out ${advice}`,
    });
  });

  it('puts the output of the CLI in code, so that a mention does not ping', () => {
    const directory = folderWith({ 'a.err': 'npm error @someone `oops`' });
    expect(resultOf(directory, 'a')).toEqual({
      problem: `edgefit gave no result. \`npm error @someone 'oops'\` ${advice}`,
    });
  });

  it('escapes the text of a workflow command', () => {
    expect(escapeCommand('50%\nnext\r')).toBe('50%25%0Anext%0D');
  });

  it('reads a scoped name from the file name that the list uses', () => {
    const directory = folderWith({ 'scope__p.json': JSON.stringify(failing) });
    expect(resultOf(directory, '@scope/p')).toEqual({ result: failing });
  });
});

describe('the problems of the rows', () => {
  it('gives one problem for a row that has no result, with or without notes', () => {
    const directory = folderWith({});
    const { problems } = reportOf(['x'], directory, [{ name: 'x', notes: 'a reason' }]);
    expect(problems).toEqual([expect.stringMatching(/^x: edgefit gave no result\./u)]);
  });

  it('collects the problems of every row, each with its name', () => {
    const directory = folderWith({
      'bad.json': JSON.stringify(failing),
      'good.json': JSON.stringify(resultFor({ workerd: 'pass', bun: 'pass' })),
    });
    const rows = [{ name: 'bad' }, { name: 'good' }];
    const { problems } = reportOf(['bad', 'good'], directory, rows);
    expect(problems).toEqual([expect.stringMatching(/^bad fails on workerd /u)]);
  });
});
