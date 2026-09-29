import { describe, expect, it } from 'vite-plus/test';

import type { CheckResult } from '@/core/check.ts';
import { annotation, formatGithub } from '@/report/github.ts';
import { summaryLine } from '@/report/summary.ts';
import { formatText } from '@/report/text.ts';
import { makeFinding } from '~/helpers.ts';

const info = {
  key: 'workerd' as const,
  platform: 'workerd',
  conditions: ['workerd', 'worker'],
  data: 'matrix@abc1234',
  settings: 'compat date 2026-04-24',
  notes: [],
};

function resultOf(findings: ReturnType<typeof makeFinding>[], ignored = 0): CheckResult {
  return {
    root: '/project',
    reports: [
      { target: info, entry: 'src/index.ts', modules: 3, findings, ignored, supported: [] },
    ],
  };
}

const chokidar = makeFinding('node:fs.watch', {
  package: { name: 'chokidar', version: '4.0.1' },
  location: { file: 'node_modules/chokidar/index.js', line: 5, column: 3 },
  chain: ['src/index.ts', 'chokidar'],
  otherLocations: [{ file: 'node_modules/chokidar/other.js', line: 1, column: 1 }],
  source: 'https://example.com/fs',
});

describe('summary line', () => {
  it('pluralizes counts and shows ignored findings only when there are some', () => {
    const warning = makeFinding('node:fs.cp', { level: 'warning' });
    expect(summaryLine(resultOf([chokidar, warning, warning]))).toBe('1 error, 2 warnings');
    expect(summaryLine(resultOf([], 2))).toBe('0 errors, 0 warnings, 2 ignored');
  });
});

describe('text report', () => {
  it('lists a finding with its owner, chain and source', () => {
    const text = formatText(resultOf([chokidar]), { color: false });
    expect(text).toContain('edgefit · workerd (workerd)');
    expect(text).toContain('error    unsupported  node:fs.watch  (workerd)');
    expect(text).toContain('chokidar@4.0.1  node_modules/chokidar/index.js:5:3  (+1 more)');
    expect(text).toContain('via src/index.ts > chokidar');
    expect(text).toContain('see https://example.com/fs');
    expect(text.endsWith('1 error, 0 warnings\n')).toBe(true);
  });

  it('says so when nothing was found', () => {
    expect(formatText(resultOf([]), { color: false })).toContain(
      'No known incompatible reachable APIs found.',
    );
  });

  it('only adds ANSI styling when color is on', () => {
    expect(formatText(resultOf([chokidar]), { color: false })).not.toContain('\u001B[');
    expect(formatText(resultOf([chokidar]), { color: true })).toContain('\u001B[');
  });
});

describe('GitHub annotations', () => {
  it('formats a workflow command with the location and chain', () => {
    expect(annotation(chokidar)).toBe(
      '::error file=node_modules/chokidar/index.js,line=5,col=3,title=edgefit%3A unsupported on workerd' +
        '::node:fs.watch is unsupported%0Ain chokidar@4.0.1%0Avia src/index.ts > chokidar',
    );
  });

  it('escapes special characters in properties and data', () => {
    const finding = makeFinding('x', {
      message: '50% done\nnext',
      location: { file: 'a,b:c.ts', line: 1, column: 1 },
    });
    const line = annotation(finding);
    expect(line).toContain('file=a%2Cb%3Ac.ts');
    expect(line).toContain('50%25 done%0Anext');
  });

  it('ends the report with the summary', () => {
    expect(
      formatGithub(resultOf([chokidar]))
        .trimEnd()
        .split('\n')
        .at(-1),
    ).toBe('edgefit: 1 error, 0 warnings');
  });
});
