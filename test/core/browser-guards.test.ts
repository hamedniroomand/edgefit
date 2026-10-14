import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetReport } from '@/core/check.ts';
import { fixture } from '~/helpers.ts';

const run = async (entry: string): Promise<TargetReport | undefined> => {
  const { reports } = await check({
    root: fixture('browser-guard-app'),
    config: { targets: ['workerd'], entry, workerd: { wranglerConfig: false } },
  });
  return reports[0];
};

const apis = (findings: readonly { api: string }[] | undefined): string[] =>
  (findings ?? []).map(finding => finding.api);

describe('code behind a check for a browser global on workerd', () => {
  it('is guarded when the code runs only where window exists', async () => {
    const report = await run('with-window.mjs');
    expect(apis(report?.findings)).toEqual([]);
    expect(apis(report?.guarded)).toEqual(['URL.createObjectURL']);
  });

  it('is a finding when the code runs only where window is missing', async () => {
    const report = await run('without-window.mjs');
    expect(apis(report?.findings)).toEqual(['URL.createObjectURL']);
  });

  it('is guarded in a function that only a guarded ternary names (the Pinia shape)', async () => {
    const report = await run('pinia.mjs');
    expect(apis(report?.findings)).toEqual([]);
    expect(apis(report?.guarded)).toEqual(
      expect.arrayContaining(['URL.createObjectURL', 'URL.revokeObjectURL']),
    );
  });
});

type Located = { location: { line: number }; otherLocations: { line: number }[] };

const lines = (findings: readonly Located[] | undefined): number[] => [
  ...new Set(
    (findings ?? [])
      .flatMap(finding => finding.otherLocations.concat(finding.location))
      .map(location => location.line),
  ),
];

describe('a read of a global that workerd lacks, through the global object', () => {
  it('is no finding when the code only tests, compares or keeps the value', async () => {
    const report = await run('value-reads.mjs');
    expect(apis(report?.findings)).toEqual([]);
  });

  it('is a finding for every other use, directly and through an alias', async () => {
    const report = await run('failing-reads.mjs');
    const expected = [...Array.from({ length: 16 }, (_, index) => index + 3), 20];
    expect(lines(report?.findings).sort((a, b) => a - b)).toEqual(expected);
  });

  it('is a finding when the code calls it, constructs it or reads a member', async () => {
    const report = await run('failing-members.mjs');
    expect(apis(report?.findings).sort()).toEqual(
      ['Bun', 'HTMLAnchorElement', 'document.visibilityState', 'window.name'].sort(),
    );
  });

  it('is a finding when the code destructures it, with an object or an array pattern', async () => {
    const report = await run('destructured-reads.mjs');
    expect(apis(report?.findings).sort()).toEqual(['Deno.version', 'document']);
  });

  it.each([
    'export-named.mjs',
    'export-default.mjs',
    'export-renamed.mjs',
    'export-module.cjs',
    'export-exports-member.cjs',
    'export-module-member.cjs',
  ])('is a finding when the file exports the const that holds it: %s', async entry => {
    const report = await run(entry);
    expect(apis(report?.findings)).toEqual(['document']);
  });

  it('does not report a bare browser global yet, a known gap', async () => {
    const report = await run('bare-reads.mjs');
    expect(apis(report?.findings)).toEqual([]);
  });
});

describe('a function that only a polyfill of a global names', () => {
  it('is guarded when the target has the global', async () => {
    const report = await run('polyfill-helper.mjs');
    expect(apis(report?.findings)).toEqual([]);
    expect(apis(report?.guarded)).toEqual(['node:fs.watch']);
  });
});
