import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { checkPackage } from '@/package/check-package.ts';
import { fixture } from '~/helpers.ts';

describe('a CommonJS file with a main guard', () => {
  it.each(['and.cjs', 'if.cjs', 'reverse.cjs', 'helper.cjs', 'bundle.cjs'])(
    'leaves the CLI code out when %s is imported',
    async file => {
      const { reports } = await check({
        root: fixture('main-guard-app'),
        config: { targets: ['workerd'], entry: `${file}.mjs`, workerd: { wranglerConfig: false } },
      });
      expect(reports[0]?.findings).toEqual([]);
    },
  );

  it.each(['and.cjs', 'if.cjs', 'reverse.cjs', 'helper.cjs', 'bundle.cjs'])(
    'keeps the CLI code when %s is an entry',
    async entry => {
      const { reports } = await check({
        root: fixture('main-guard-app'),
        config: { targets: ['workerd'], entry, workerd: { wranglerConfig: false } },
      });
      expect(reports[0]?.findings.map(finding => finding.api)).toContain(
        'node:child_process.spawn',
      );
    },
  );

  it('uses the same rule for a package check', async () => {
    const result = await checkPackage(fixture('main-guard-app'), { targets: ['workerd'] });
    expect(result.summary.workerd).toBe('pass');
  });
});
