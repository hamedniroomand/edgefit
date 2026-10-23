import { marker, markdownOf } from '@scripts/package-table/report.mjs';
import { describe, expect, it } from 'vite-plus/test';

type Status = 'pass' | 'warn' | 'fail' | 'error' | 'unchecked';
type Cell = { status: Status; findings?: { level: string; api: string }[]; message?: string };

type Result = {
  package: string;
  resolved: string;
  summary: Record<string, Status>;
  entries: { subpath: string; results: Record<string, Cell> }[];
  worstExport?: Record<string, { subpath: string; name: string; status: Status }>;
};

function resultFor(summary: Record<string, Status>, entries: Result['entries'] = []): Result {
  return { package: 'p', resolved: '1.2.3', summary, entries };
}

const failing = resultFor({ workerd: 'fail', bun: 'pass' }, [
  {
    subpath: '.',
    results: {
      workerd: { status: 'fail', findings: [{ level: 'error', api: 'node:child_process.spawn' }] },
      bun: { status: 'pass' },
    },
  },
]);

describe('the table of the report', () => {
  it('starts with the marker and shows a mark, the notes and the verdict of each row', () => {
    const markdown = markdownOf([
      { name: 'p', result: failing, notes: true },
      {
        name: 'q',
        result: resultFor({ workerd: 'warn', bun: 'error' }),
        notes: false,
        problems: ['cannot be checked on bun (main entry `.`) and the row has no notes.'],
      },
    ]);
    expect(markdown.startsWith(`${marker}\n`)).toBe(true);
    expect(markdown).toContain('| `p@1.2.3` | ✗ | ✓ | yes | passes |');
    expect(markdown).toContain('| `q@1.2.3` | ⚠ | ? | no | fails |');
  });

  it('defines the marks, the notes and the verdict', () => {
    const markdown = markdownOf([{ name: 'p', result: failing, notes: true }]);
    expect(markdown).toContain('✓ pass, ⚠ warning, ✗ fail, ? could not be checked, – not checked.');
    expect(markdown).toContain('or of its worst entry when the main entry could not be checked');
    expect(markdown).toContain('Notes: the row has a `notes` field');
    expect(markdown).toContain('Job: the Package list job fails');
  });

  it('puts the name of a row with a problem in code, so that a scoped name mentions nobody', () => {
    const markdown = markdownOf([
      { name: '@scope/p', notes: false, problem: 'edgefit gave no result.' },
    ]);
    expect(markdown).toContain('- `@scope/p`: edgefit gave no result.');
    expect(markdown).toContain('| `@scope/p` |');
    expect(markdown).not.toMatch(/(?<!`)@scope\/p/u);
  });

  it('lists the problem of a row under the table', () => {
    const markdown = markdownOf([
      {
        name: 'p',
        result: failing,
        notes: false,
        problems: ['fails on workerd (…) and the row has no notes.'],
      },
    ]);
    expect(markdown).toContain('- `p` fails on workerd (…) and the row has no notes.');
    expect(markdown).toContain('| `p@1.2.3` | ✗ | ✓ | no | fails |');
  });
});

describe('the results that are not a pass', () => {
  it('lists them with their APIs, up to ten', () => {
    const entries = Array.from({ length: 12 }, (_unused, index) => ({
      subpath: `./s${index}`,
      results: {
        workerd: { status: 'fail' as const, findings: [{ level: 'error', api: 'node:fs.watch' }] },
      },
    }));
    const markdown = markdownOf([
      { name: 'p', result: resultFor({ workerd: 'pass' }, entries), notes: false },
    ]);
    expect(markdown).toContain(
      'results that are not ✓ (subpath, target): `./s0` workerd ✗ (`node:fs.watch`)',
    );
    expect(markdown).toContain('`./s9` workerd ✗ (`node:fs.watch`), and 2 more.');
    expect(markdown).not.toContain('`./s10`');
  });

  it('shows the mark of a cell that could not be checked, and its message', () => {
    const entries = [
      { subpath: './x', results: { workerd: { status: 'error' as const, message: 'boom' } } },
      { subpath: './y', results: { workerd: { status: 'unchecked' as const } } },
    ];
    const markdown = markdownOf([
      { name: 'p', result: resultFor({ workerd: 'pass' }, entries), notes: false },
    ]);
    expect(markdown).toContain('`./x` workerd ? (`boom`), `./y` workerd –');
  });

  it('cuts a report that is longer than a comment can be, and keeps the marker first', () => {
    const subpath = `./${'x'.repeat(20_000)}`;
    const entries = [{ subpath, results: { workerd: { status: 'fail' as const } } }];
    const items = Array.from({ length: 5 }, (_unused, index) => ({
      name: `p${index}`,
      result: resultFor({ workerd: 'pass' }, entries),
      notes: false,
    }));
    const markdown = markdownOf(items);
    expect(markdown.startsWith(marker)).toBe(true);
    expect(markdown.length).toBeLessThan(61_000);
    expect(markdown).toContain('The report is cut');
  });
});

describe('the text of a result in the report', () => {
  it('puts the message of a cell in code, on one line, so that a mention does no harm', () => {
    const entries = [
      {
        subpath: './x',
        results: { workerd: { status: 'unchecked' as const, message: 'needs "@org/team"\nnext' } },
      },
    ];
    const markdown = markdownOf([
      { name: 'p', result: resultFor({ workerd: 'pass' }, entries), notes: false },
    ]);
    expect(markdown).toContain('`./x` workerd – (`needs "@org/team" next`)');
  });

  it('puts a name with a backtick in code without ending the code', () => {
    const entries = [
      {
        subpath: '.',
        results: {
          workerd: { status: 'warn' as const, findings: [{ level: 'warning', api: 'a`b' }] },
        },
      },
    ];
    const markdown = markdownOf([
      { name: 'p', result: resultFor({ workerd: 'warn' }, entries), notes: false },
    ]);
    expect(markdown).toContain("(`a'b`)");
  });

  it('shows an export that is worse than the main entry, and says that the job does not fail', () => {
    const result = {
      ...resultFor({ workerd: 'pass' }),
      worstExport: { workerd: { subpath: '.', name: 'spawn', status: 'fail' as const } },
    };
    expect(markdownOf([{ name: 'p', result, notes: false }])).toContain(
      '`p`: an export that is worse than the main entry (export, subpath, target): `spawn` of `.` workerd ✗. The job does not fail for it.',
    );
  });
});
