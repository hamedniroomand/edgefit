import { describe, expect, it } from 'vite-plus/test';

import { summarize, targetResult } from '@/package/result.ts';
import type { PackageEntryResult, PackageStatus } from '@/package/result.ts';
import { formatPackageText } from '@/package/text.ts';

const entry = (subpath: string, status: PackageStatus | undefined): PackageEntryResult => ({
  subpath,
  specifier: `p${subpath.slice(1)}`,
  results: status === undefined ? {} : { workerd: { status, errors: 0, warnings: 0 } },
});

describe('the result of a target', () => {
  it('is the status of the main entry, and names a worse subpath', () => {
    const entries = [entry('./node', 'fail'), entry('.', 'pass'), entry('./web', 'warn')];
    expect(targetResult(entries, 'workerd')).toEqual({
      status: 'pass',
      worst: { subpath: './node', status: 'fail' },
    });
  });

  it('has no worst entry when the main entry is the worst', () => {
    expect(targetResult([entry('.', 'warn'), entry('./web', 'pass')], 'workerd')).toEqual({
      status: 'warn',
    });
  });

  it('is the worst entry when there is no main entry or it was not checked', () => {
    expect(targetResult([entry('./a', 'pass'), entry('./b', 'warn')], 'workerd')).toEqual({
      status: 'warn',
    });
    expect(targetResult([entry('.', 'unchecked'), entry('./a', 'fail')], 'workerd')).toEqual({
      status: 'fail',
    });
    expect(targetResult([entry('.', 'unchecked')], 'workerd')).toEqual({ status: 'error' });
  });

  it('is an error when the main entry could not be checked and others pass', () => {
    expect(targetResult([entry('.', 'error'), entry('./a', 'pass')], 'workerd')).toEqual({
      status: 'error',
    });
  });

  it('collects the result and the worst entry of each target', () => {
    const entries = [entry('.', 'pass'), entry('./node', 'fail')];
    expect(summarize(entries, ['workerd'])).toEqual({
      summary: { workerd: 'pass' },
      worst: { workerd: { subpath: './node', status: 'fail' } },
    });
    expect(summarize([entry('.', 'pass')], ['workerd'])).toEqual({ summary: { workerd: 'pass' } });
  });
});

describe('the text of a package result', () => {
  it('names the worst subpath when it is worse than the main entry', () => {
    const entries = [entry('.', 'pass'), entry('./node', 'fail')];
    const result = {
      version: 2,
      package: 'p',
      resolved: '1.0.0',
      checkedAt: '2026-01-01T00:00:00.000Z',
      edgefit: '0.9.2',
      data: {},
      targets: ['workerd'],
      context: {},
      entries,
      ...summarize(entries, ['workerd']),
    } as const;
    const text = formatPackageText(result as never, { color: false });
    expect(text).toContain('worst subpath on workerd: ./node ✗');
    expect(text).toContain('overall');
  });
});
