import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { checkPackage } from '@/package/check-package.ts';
import { formatPackageText } from '@/package/text.ts';
import { fixture } from '~/helpers.ts';

describe('an optional peer dependency that is not installed', () => {
  it('is a note of the entry in the package flow, and the entry passes', async () => {
    const result = await checkPackage(fixture('packages/needs-peer'), { targets: ['workerd'] });
    expect(result.entries[0]?.results.workerd).toEqual({
      status: 'pass',
      errors: 0,
      warnings: 0,
      notes: ['peer edgefit-peer-missing not installed, checked in your project'],
    });
    expect(result.summary.workerd).toBe('pass');
    expect(formatPackageText(result, { color: false })).toContain(
      'peer edgefit-peer-missing not installed, checked in your project: .',
    );
  });

  it('is still an unknown warning when edgefit checks a project', async () => {
    const { reports } = await check({
      root: fixture('peer-app'),
      config: { targets: ['workerd'], entry: 'src/optional.ts' },
    });
    expect(reports[0]?.findings.map(finding => finding.category)).toEqual(['unknown']);
    expect(reports[0]?.missingPeers).toBeUndefined();
  });

  it('is listed by name when a check asks for notes', async () => {
    const { reports } = await check({
      root: fixture('peer-app'),
      config: { targets: ['workerd'], entry: 'src/optional.ts' },
      missingPeersAsNotes: true,
    });
    expect(reports[0]?.findings).toEqual([]);
    expect(reports[0]?.missingPeers).toEqual(['react']);
  });
});
