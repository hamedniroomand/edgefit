import { describe, expect, it } from 'vite-plus/test';

import { check, exitCodeOf } from '@/core/check.ts';
import type { CheckResult } from '@/core/check.ts';
import { settleTargets } from '@/core/run-targets.ts';
import { EdgefitError } from '@/errors.ts';
import { formatCompareJson } from '@/report/compare-json.ts';
import { formatCompareText } from '@/report/compare-text.ts';
import { formatReport } from '@/report/index.ts';
import type { EdgefitConfig } from '@/types.ts';
import { fixture } from '~/helpers.ts';

const config = (targets: EdgefitConfig['targets']): EdgefitConfig => ({
  targets,
  entry: 'src/index.mjs',
  workerd: { wranglerConfig: false },
});

async function run(targets: EdgefitConfig['targets']): Promise<CheckResult> {
  const result = await check({ root: fixture('partial-fail-app'), config: config(targets) });
  return result;
}

describe('a target whose module graph does not resolve', () => {
  it('is kept as failed, and the other targets have a report', async () => {
    const result = await run(['workerd', 'bun', 'deno']);
    expect(result.reports.map(report => report.target.key)).toEqual(['bun', 'deno']);
    expect(result.failed?.map(item => item.key)).toEqual(['workerd']);
    expect(result.failed?.[0]?.message).toContain('hash-lib-wasm');
    expect(exitCodeOf(result)).toBe(2);
  });

  it('is thrown when no target has a report', async () => {
    await expect(run(['workerd'])).rejects.toThrow('hash-lib-wasm');
  });

  it('leaves out `failed` when every target is checked', async () => {
    const result = await run(['bun', 'deno']);
    expect(result.failed).toBeUndefined();
    expect(exitCodeOf(result)).toBe(0);
  });
});

describe('the report of a run with a failed target', () => {
  it('shows the reports, then the error, in the text report', async () => {
    const text = formatReport(await run(['workerd', 'bun']), 'text', { color: false });
    expect(text).toContain('No known incompatible reachable APIs found.');
    expect(text).toContain('edgefit · workerd could not be checked:');
  });

  it('lists the target in the JSON report', async () => {
    const json = JSON.parse(
      formatReport(await run(['workerd', 'bun']), 'json', { color: false }),
    ) as {
      failed: { target: string; message: string }[];
      targets: { key: string }[];
    };
    expect(json.targets.map(target => target.key)).toEqual(['bun']);
    expect(json.failed.map(item => item.target)).toEqual(['workerd']);
  });

  it('is an error annotation in the GitHub report', async () => {
    const text = formatReport(await run(['workerd', 'bun']), 'github', { color: false });
    expect(text).toContain('::error title=edgefit%3A workerd could not be checked::');
  });

  it('is a column with the not-checked mark in the compare report, with the error under it', async () => {
    const result = await run(['workerd', 'bun']);
    const text = formatCompareText(result, { all: true, verbose: false, color: false });
    expect(text).toContain('edgefit · workerd could not be checked:');
    const json = JSON.parse(formatCompareJson(result, { all: true })) as { failed: unknown[] };
    expect(json.failed).toHaveLength(1);
  });
});

describe('settling the targets', () => {
  const key = 'workerd' as const;

  it('keeps an EdgefitError of one target and the report of the other', async () => {
    const { reports, failed } = await settleTargets([
      { key, report: Promise.reject(new EdgefitError('no graph', 'try again')) },
      { key: 'bun', report: Promise.resolve('report') },
    ]);
    expect(reports).toEqual(['report']);
    expect(failed).toMatchObject([{ key, message: 'no graph', hint: 'try again' }]);
  });

  it('throws an error that is not an EdgefitError, even when another target has a report', async () => {
    await expect(
      settleTargets([
        { key, report: Promise.reject(new TypeError('bug')) },
        { key: 'bun', report: Promise.resolve('report') },
      ]),
    ).rejects.toThrow('bug');
  });
});
