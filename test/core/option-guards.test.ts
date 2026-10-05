import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetReport } from '@/core/check.ts';
import { checkPackage } from '@/package/check-package.ts';
import { fixture } from '~/helpers.ts';

const run = async (entry: string): Promise<TargetReport | undefined> => {
  const { reports } = await check({
    root: fixture('option-app'),
    config: { targets: ['workerd'], entry, workerd: { wranglerConfig: false } },
  });
  return reports[0];
};

describe('code behind an option of the API of a package', () => {
  it.each(['unset.mjs', 'false.mjs', 'after-return.mjs'])(
    'is guarded when %s does not set the option',
    async entry => {
      const report = await run(entry);
      expect(report?.findings).toEqual([]);
      expect(report?.guarded.map(finding => finding.api)).toEqual(['node:http2.createServer']);
      expect(report?.guarded[0]?.options).toEqual(['http2']);
    },
  );

  it.each(['literal.mjs', 'variable.mjs', 'assigned.mjs'])(
    'is a finding when %s sets the option',
    async entry => {
      const report = await run(entry);
      expect(report?.findings.map(finding => finding.api)).toEqual(['node:http2.createServer']);
      expect(report?.guarded).toEqual([]);
    },
  );

  it('does not fail the package check', async () => {
    const result = await checkPackage(fixture('option-app'), { targets: ['workerd'] });
    expect(result.summary.workerd).toBe('pass');
  });
});
