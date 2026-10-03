import { describe, expect, it } from 'vite-plus/test';

import type { PackageResult } from '@/package/result.ts';
import { formatPackageText } from '@/package/text.ts';

const result: PackageResult = {
  version: 1,
  package: '@s/p',
  resolved: '1.0.0',
  checkedAt: '2026-01-01T00:00:00.000Z',
  edgefit: '0.5.0',
  data: {},
  targets: ['workerd', 'bun'],
  summary: { workerd: 'fail', bun: 'error' },
  context: {},
  entries: [
    {
      subpath: '.',
      specifier: '@s/p',
      results: {
        workerd: { status: 'fail', errors: 1, warnings: 2 },
        bun: { status: 'error', errors: 0, warnings: 0, message: 'boom' },
      },
    },
  ],
};

describe('formatPackageText', () => {
  it('lists each problem with counts or the failure message', () => {
    const text = formatPackageText(result, { color: false });
    expect(text).toContain('. on workerd: 1 error, 2 warnings');
    expect(text).toContain('. on bun: could not be checked: boom');
  });

  it('lists an unchecked entry with the reason', () => {
    const unchecked: PackageResult = {
      ...result,
      entries: [
        {
          subpath: './native',
          specifier: '@s/p/native',
          results: {
            workerd: { status: 'unchecked', errors: 0, warnings: 0, message: 'needs "react"' },
          },
        },
      ],
    };
    expect(formatPackageText(unchecked, { color: false })).toContain(
      './native on workerd: not checked: needs "react"',
    );
  });
});
