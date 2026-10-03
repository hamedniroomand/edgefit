import { describe, expect, it } from 'vite-plus/test';

import { checkPackage } from '@/package/check-package.ts';
import { resultsByExport } from '@/package/exports.ts';
import { summarize, worstExportOf } from '@/package/result.ts';
import type { ExportResult, PackageEntryResult, PackageStatus } from '@/package/result.ts';
import { formatPackageText } from '@/package/text.ts';
import type { Finding } from '@/types.ts';
import { fixture } from '~/helpers.ts';

const finding = (api: string, level: Finding['level'], exports: string[]): Finding => ({
  category: level === 'error' ? 'unsupported' : 'mismatch',
  level,
  api,
  target: 'workerd',
  message: `${api} detail`,
  detail: 'detail',
  package: undefined,
  location: { file: 'index.js', line: 1, column: 1 },
  otherLocations: [],
  chain: [],
  exports,
});

const entry = (
  subpath: string,
  exports?: ExportResult[],
  status: PackageStatus = 'pass',
): PackageEntryResult => ({
  subpath,
  specifier: `p${subpath.slice(1)}`,
  results: {
    workerd: {
      status,
      errors: 0,
      warnings: 0,
      ...(exports === undefined ? {} : { exports }),
    },
  },
});

const risky: ExportResult = { name: 'risky', level: 'error', findings: [] };
const noisy: ExportResult = { name: 'noisy', level: 'warning', findings: [] };

describe('the findings that only some exports reach', () => {
  it('are grouped by export, with an export that has an error first', () => {
    const results = resultsByExport([
      finding('node:net.createServer', 'warning', ['server']),
      finding('node:fs.watch', 'error', ['watcher']),
      finding('node:fs.stat', 'warning', ['watcher', 'server']),
    ]);
    expect(results.map(item => [item.name, item.level])).toEqual([
      ['watcher', 'error'],
      ['server', 'warning'],
    ]);
    expect(results[1]?.findings.map(item => item.api)).toEqual([
      'node:net.createServer',
      'node:fs.stat',
    ]);
  });

  it('are left out for a finding that every export reaches', () => {
    expect(
      resultsByExport([{ ...finding('node:fs.watch', 'error', []), exports: undefined }]),
    ).toEqual([]);
  });
});

describe('the worst export of a target', () => {
  it('ranks an export with an error above one with a warning', () => {
    expect(worstExportOf([entry('.', [noisy, risky])], 'workerd')).toEqual({
      subpath: '.',
      name: 'risky',
      status: 'fail',
    });
    expect(worstExportOf([entry('.', [noisy])], 'workerd')?.status).toBe('warn');
  });

  it('is taken from every entry, not only from the main entry', () => {
    const entries = [entry('.', [noisy]), entry('./node', [risky])];
    expect(worstExportOf(entries, 'workerd')).toEqual({
      subpath: './node',
      name: 'risky',
      status: 'fail',
    });
  });

  it('is left out of the summary when it is not worse than the result of the target', () => {
    const failing = [entry('.', [risky], 'fail')];
    expect(summarize(failing, ['workerd'])).toEqual({ summary: { workerd: 'fail' } });
    const warning = [entry('.', [noisy], 'warn')];
    expect(summarize(warning, ['workerd'])).toEqual({ summary: { workerd: 'warn' } });
    const worse = [entry('.', [risky], 'warn')];
    expect(summarize(worse, ['workerd']).worstExport?.workerd?.status).toBe('fail');
  });

  it('is left out of the summary when no export has findings', () => {
    expect(summarize([entry('.')], ['workerd'])).toEqual({ summary: { workerd: 'pass' } });
    expect(summarize([entry('.', [risky])], ['workerd'])).toEqual({
      summary: { workerd: 'pass' },
      worstExport: { workerd: { subpath: '.', name: 'risky', status: 'fail' } },
    });
  });
});

describe('a package whose findings sit behind some exports', () => {
  it('passes, and lists the exports with their findings in the result and in the text', async () => {
    const result = await checkPackage(fixture('packages/split-exports'), { targets: ['workerd'] });
    expect(result.summary.workerd).toBe('pass');
    const found = result.entries[0]?.results.workerd;
    expect(found).toMatchObject({ status: 'pass', errors: 0, warnings: 0 });
    expect(found?.exports?.map(item => [item.name, item.level])).toEqual([
      ['statAll', 'error'],
      ['watchAll', 'error'],
    ]);
    expect(result.worstExport?.workerd).toMatchObject({ subpath: '.', status: 'fail' });
    const text = formatPackageText(result, { color: false });
    expect(text).toContain('. on workerd, only through watchAll: unsupported node:fs.watch');
    expect(text).toContain('worst export on workerd:');
  }, 30_000);
});
