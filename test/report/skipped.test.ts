import { describe, expect, it } from 'vite-plus/test';

import { run } from '@/cli/run.ts';
import type { CheckResult } from '@/core/check.ts';
import { formatDiffGithub } from '@/report/diff-github.ts';
import { formatDiffJson } from '@/report/diff-json.ts';
import { formatDiffText } from '@/report/diff-text.ts';
import { diffReports } from '@/report/diff.ts';
import { formatGithub } from '@/report/github.ts';
import { parseJsonReport } from '@/report/json.ts';
import { captureIo, fixture } from '~/helpers.ts';

const skipped = { key: 'vercel-edge' as const, searched: ['middleware.{ts,js,mts,mjs}', 'routes'] };
const headJson = JSON.stringify({
  version: 2,
  skipped: [skipped],
  targets: [{ key: 'workerd', entries: ['src/index.ts'], findings: [] }],
});
const baseJson = JSON.stringify({
  version: 2,
  targets: [{ key: 'workerd', entries: ['src/index.ts'], findings: [] }],
});

describe('skipped targets in a check report', () => {
  it('adds one warning for each target to the GitHub annotations', () => {
    const result: CheckResult = { root: '/project', reports: [], skipped: [skipped] };
    expect(formatGithub(result)).toContain(
      '::warning title=edgefit%3A vercel-edge skipped::No entry found. Searched: middleware.{ts,js,mts,mjs}, routes',
    );
  });
});

describe('a skipped target that searched nothing', () => {
  it('says only that no entry was found', () => {
    const result: CheckResult = {
      root: '/project',
      reports: [],
      skipped: [{ key: 'bun', searched: [] }],
    };
    expect(formatGithub(result)).toContain(
      '::warning title=edgefit%3A bun skipped::No entry found.\n',
    );
  });
});

describe('skipped targets in a diff', () => {
  const diff = diffReports(
    parseJsonReport(baseJson, 'base.json'),
    parseJsonReport(headJson, 'head.json'),
  );

  it('reads skipped from the head report only', () => {
    expect(diff.skipped).toEqual([skipped]);
    expect(
      diffReports(parseJsonReport(headJson, 'a'), parseJsonReport(baseJson, 'b')).skipped,
    ).toEqual([]);
  });

  it('prints them in the text, the GitHub annotations and the JSON', () => {
    expect(formatDiffText(diff, { color: false })).toContain(
      'edgefit · vercel-edge skipped: No entry found. Searched: middleware.{ts,js,mts,mjs}, routes',
    );
    expect(formatDiffGithub(diff)).toContain('::warning title=edgefit%3A vercel-edge skipped::');
    expect((JSON.parse(formatDiffJson(diff)) as { skipped: unknown }).skipped).toEqual([skipped]);
  });
});

describe('skipped targets in compare', () => {
  it('lists them in the JSON output and as a line of text', async () => {
    const json = captureIo(fixture('worker'));
    await run(['compare', 'workerd', 'vercel-edge', '--format', 'json'], json);
    const report = JSON.parse(json.output()) as { skipped: { key: string }[] };
    expect(report.skipped.map(({ key }) => key)).toEqual(['vercel-edge']);
    const text = captureIo(fixture('worker'));
    await run(['compare', 'workerd', 'vercel-edge', '--no-color'], text);
    expect(text.output()).toContain('edgefit · vercel-edge skipped: No entry found.');
  });
});
