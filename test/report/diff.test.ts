import { describe, expect, it } from 'vite-plus/test';

import { formatDiffGithub } from '@/report/diff-github.ts';
import { formatDiffText } from '@/report/diff-text.ts';
import { diffFails, diffReports } from '@/report/diff.ts';
import type { JsonReport } from '@/report/json.ts';
import type { Finding, PackageInfo } from '@/types.ts';

function finding(api: string, owner?: PackageInfo, parts: Partial<Finding> = {}): Finding {
  return {
    category: 'unsupported',
    level: 'error',
    api,
    target: 'workerd',
    message: `${api} is unsupported`,
    detail: 'is unsupported',
    package: owner,
    location: { file: 'src/index.ts', line: 1, column: 1 },
    otherLocations: [],
    chain: ['src/index.ts'],
    ...parts,
  };
}

function report(...findings: Finding[]): JsonReport {
  return { version: 1, targets: [{ key: 'workerd', findings }] };
}

const chokidar = { name: 'chokidar', version: '4.0.1' };
const watch = finding('node:fs.watch', chokidar);
const exec = finding('node:child_process.exec', { name: 'dual-runtime', version: '1.2.0' });

function apis(findings: readonly Finding[]): string[] {
  return findings.map(entry => entry.api);
}

describe('diff reports', () => {
  it('reports findings only in the head as new', () => {
    const diff = diffReports(report(), report(watch));
    expect(apis(diff.added)).toEqual(['node:fs.watch']);
    expect(diff.fixed).toEqual([]);
  });

  it('reports findings only in the base as fixed', () => {
    const diff = diffReports(report(watch, exec), report(watch));
    expect(apis(diff.fixed)).toEqual(['node:child_process.exec']);
    expect(apis(diff.unchanged)).toEqual(['node:fs.watch']);
    expect(diff.added).toEqual([]);
  });

  it('ignores version bumps and moved lines', () => {
    const bumped = finding(
      'node:fs.watch',
      { name: 'chokidar', version: '4.0.3' },
      {
        location: { file: 'node_modules/chokidar/handler.js', line: 212, column: 3 },
      },
    );
    const diff = diffReports(report(watch), report(bumped));
    expect(diff.added).toEqual([]);
    expect(diff.fixed).toEqual([]);
    expect(diff.unchanged).toEqual([bumped]);
  });

  it('tells findings apart by target, category and owner', () => {
    const base = report(watch, finding('node:fs.watch'));
    const head = report(
      finding('node:fs.watch', chokidar, { category: 'mocked' }),
      finding('node:fs.watch', undefined, {
        location: { file: 'src/dev.ts', line: 1, column: 1 },
      }),
    );
    const diff = diffReports(base, head);
    expect(diff.added).toHaveLength(2);
    expect(diff.fixed).toHaveLength(2);
  });
});

describe('diff fail-on', () => {
  it('fails according to fail-on', () => {
    const warning = finding('require(<expression>)', undefined, { level: 'warning' });
    const onlyOld = diffReports(report(watch), report(watch));
    const newWarning = diffReports(report(), report(warning));
    const newError = diffReports(report(), report(watch));
    expect(diffFails(onlyOld, 'new-errors')).toBe(false);
    expect(diffFails(newWarning, 'new-errors')).toBe(false);
    expect(diffFails(newError, 'new-errors')).toBe(true);
    expect(diffFails(onlyOld, 'errors')).toBe(true);
    expect(diffFails(newError, 'never')).toBe(false);
  });
});

describe('suggested fixes in a diff', () => {
  const fixed = finding('node:fs.watch', chokidar, {
    suggestion: {
      kind: 'change',
      text: 'Watch in development only.',
      target: 'workerd',
      source: 'https://example.com/watch',
    },
  });
  const diff = diffReports(report(), report(fixed));

  it('show for a new finding in the text and in the annotation', () => {
    expect(formatDiffText(diff, { color: false })).toContain('fix: Watch in development only.');
    expect(formatDiffGithub(diff)).toContain('fix: Watch in development only.');
  });
});
