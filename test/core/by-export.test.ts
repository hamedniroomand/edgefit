import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { collectFindings, defaultLevels } from '@/core/findings.ts';
import type { ModuleUsages } from '@/core/findings.ts';
import type { EdgefitConfig, Finding } from '@/types.ts';
import { fixture, makeUsage, stubTarget } from '~/helpers.ts';

function describeFinding(finding: Finding): { api: string; exports?: string[] } {
  return finding.exports === undefined
    ? { api: finding.api }
    : { api: finding.api, exports: finding.exports };
}

async function findingsOf(byExport: boolean): Promise<{ api: string; exports?: string[] }[]> {
  const config: EdgefitConfig = {
    targets: ['workerd'],
    entry: 'src/all.mjs',
    workerd: { wranglerConfig: false },
  };
  const result = await check({ root: fixture('lazy-server-app'), config, byExport });
  return (result.reports[0]?.findings ?? []).map(finding => describeFinding(finding));
}

describe('check with byExport', () => {
  it('names the export that reaches a finding that only one export reaches', async () => {
    expect(await findingsOf(true)).toEqual([
      { api: 'node:net.createServer', exports: ['createServer'] },
    ]);
  });

  it('leaves the finding as it is without the option', async () => {
    expect(await findingsOf(false)).toEqual([{ api: 'node:net.createServer' }]);
  });
});

describe('the exports of findings that are grouped', () => {
  const tagged = (exports?: string[]): ModuleUsages => ({
    file: 'node_modules/pkg/index.js',
    package: { name: 'pkg', version: '1.0.0' },
    chain: [],
    usages: [
      makeUsage({ module: 'fs', path: ['watch'] }, exports === undefined ? {} : { exports }),
    ],
  });
  const collect = (...modules: ModuleUsages[]): string[] | undefined =>
    collectFindings(modules, {
      target: stubTarget({ 'fs.watch': { status: 'unsupported', note: 'missing' } }),
      levels: defaultLevels,
      ignore: [],
    }).findings[0]?.exports;

  it('joins the exports of the same finding', () => {
    expect(collect(tagged(['b']), tagged(['a']))).toEqual(['a', 'b']);
  });

  it('drops the exports when another location of the finding has none', () => {
    expect(collect(tagged(['a']), tagged())).toBeUndefined();
    expect(collect(tagged(), tagged(['a']))).toBeUndefined();
  });
});
