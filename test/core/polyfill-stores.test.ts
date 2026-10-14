import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetReport } from '@/core/check.ts';
import { fixture } from '~/helpers.ts';

const run = async (
  entry: string,
  compatibilityFlags?: string[],
): Promise<TargetReport | undefined> => {
  const { reports } = await check({
    root: fixture('polyfill-store-app'),
    config: {
      targets: ['workerd'],
      entry,
      workerd: {
        wranglerConfig: false,
        ...(compatibilityFlags === undefined
          ? {}
          : { compatibilityDate: '2026-09-29', compatibilityFlags }),
      },
    },
  });
  return reports[0];
};

const watches = (findings: readonly { api: string }[] | undefined): string[] =>
  (findings ?? []).map(finding => finding.api).filter(api => api === 'node:fs.watch');

describe('the value of a polyfill store on workerd', () => {
  it.each([
    'store-call.mjs',
    'store-arrow.mjs',
    'store-nullish.mjs',
    'store-process.mjs',
    'store-buffer.mjs',
    'store-const-alias.mjs',
    'store-const-alias-function.mjs',
    'helper.mjs',
  ])('is guarded when the target has the global: %s', async entry => {
    const report = await run(entry);
    expect(watches(report?.findings)).toEqual([]);
    expect(watches(report?.guarded)).toEqual(['node:fs.watch']);
  });

  it.each([
    'store-missing.mjs',
    'store-unchecked.mjs',
    'store-nullish-missing.mjs',
    'store-and.mjs',
    'store-alias.mjs',
    'store-alias-branch.mjs',
    'store-let-alias.mjs',
    'store-shadowed-alias.mjs',
    'helper-missing.mjs',
    'helper-unchecked.mjs',
    'helper-called.mjs',
    'helper-two-stores.mjs',
  ])('is a finding when the store can run or the value is used elsewhere: %s', async entry => {
    const report = await run(entry);
    expect(watches(report?.findings)).toEqual(['node:fs.watch']);
  });
});

describe('a store to a global that nodejs_compat adds', () => {
  const apis = (findings: readonly { api: string }[] | undefined): string[] =>
    (findings ?? []).map(finding => finding.api);

  it.each([
    'compat-process.mjs',
    'compat-buffer.mjs',
    'compat-process-nullish.mjs',
    'compat-process-check.mjs',
  ])('is guarded with nodejs_compat and a finding without it: %s', async entry => {
    const withCompat = await run(entry, ['nodejs_compat']);
    expect(apis(withCompat?.findings)).not.toContain('Deno.cwd');
    expect(apis(withCompat?.guarded)).toContain('Deno.cwd');
    const without = await run(entry, ['no_nodejs_compat']);
    expect(apis(without?.findings)).toContain('Deno.cwd');
  });

  it('is guarded behind a check for process when nodejs_compat is off', async () => {
    const report = await run('compat-process-typeof.mjs', ['no_nodejs_compat']);
    expect(apis(report?.findings)).not.toContain('Deno.cwd');
    expect(apis(report?.guarded)).toContain('Deno.cwd');
  });
});

describe('a check of a global that exists with a falsy value', () => {
  it.each([
    'falsy-or-store.mjs',
    'falsy-nullish-store.mjs',
    'falsy-or.mjs',
    'falsy-nullish.mjs',
    'falsy-if-store.mjs',
    'falsy-if.mjs',
    'falsy-compare.mjs',
    'falsy-typeof.mjs',
    'falsy-guard-clause.mjs',
    'falsy-else.mjs',
    'falsy-ternary.mjs',
    'falsy-and.mjs',
    'falsy-bare.mjs',
    'falsy-nullish-const.mjs',
  ])('does not guard the code that runs for the falsy value: %s', async entry => {
    const report = await run(entry);
    expect(watches(report?.findings)).toEqual(['node:fs.watch']);
  });

  it.each([
    'nan-nullish-store.mjs',
    'nan-nullish.mjs',
    'nan-nullish-const.mjs',
    'nan-nullish-helper.mjs',
    'nan-nullish-or.mjs',
    'nan-typeof.mjs',
    'nan-compare.mjs',
  ])('guards the code that does not run for NaN: %s', async entry => {
    const report = await run(entry);
    expect(watches(report?.findings)).toEqual([]);
    expect(watches(report?.guarded)).toEqual(['node:fs.watch']);
  });
});
