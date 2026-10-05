import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { checkPackage } from '@/package/check-package.ts';
import { fixture } from '~/helpers.ts';

describe('a missing module loaded by require', () => {
  it.each(['bun', 'deno'] as const)('reports a lazy load on %s', async target => {
    const { reports } = await check({
      root: fixture('missing-require-app'),
      config: { targets: [target], entry: 'lazy.cjs' },
    });
    expect(reports[0]?.findings).toMatchObject([
      {
        category: 'unknown',
        api: 'edgefit-missing-driver',
        location: { file: 'lazy.cjs', line: 3 },
      },
    ]);
    expect(reports[0]?.findings[0]?.detail).toContain('is not installed');
  });

  it.each(['top.cjs', 'mixed.cjs', 'relative.cjs', 'import.mjs', 'broken.cjs'])(
    'still fails for %s',
    async entry => {
      await expect(
        check({ root: fixture('missing-require-app'), config: { targets: ['bun'], entry } }),
      ).rejects.toThrow('Could not resolve');
    },
  );

  it('reports the lazy load in the package flow', async () => {
    const result = await checkPackage(fixture('missing-require-app'), {
      targets: ['bun', 'deno'],
    });
    expect(result.summary).toEqual({ bun: 'warn', deno: 'warn' });
    for (const target of ['bun', 'deno'] as const) {
      expect(result.entries[0]?.results[target]).toMatchObject({
        status: 'warn',
        warnings: 1,
        errors: 0,
      });
    }
  });
});

describe('multiple lazy loads of a missing module', () => {
  it('keeps all call locations in one finding', async () => {
    const { reports } = await check({
      root: fixture('missing-require-app'),
      config: { targets: ['bun'], entry: 'several.cjs' },
    });
    expect(reports[0]?.findings).toMatchObject([
      {
        api: 'edgefit-missing-driver',
        location: { line: 1 },
        otherLocations: [{ line: 2 }],
      },
    ]);
  });
});
