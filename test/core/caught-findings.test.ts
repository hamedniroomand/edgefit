import { describe, expect, it } from 'vite-plus/test';

import { collectFindings, defaultLevels } from '@/core/findings.ts';
import type { FindingOptions, ModuleUsages } from '@/core/findings.ts';
import type { Usage } from '@/types.ts';
import { makeUsage, stubTarget } from '~/helpers.ts';

const target = stubTarget({
  'process.binding': { status: 'unsupported', note: 'exists, but throws' },
  'fs.cp': { status: 'mismatch', note: 'differs' },
});
const options: FindingOptions = { target, levels: defaultLevels, ignore: [] };

const module = (usage: Usage): ModuleUsages => ({
  file: 'a.js',
  package: undefined,
  chain: ['a.js'],
  usages: [usage],
});
const binding = (parts: Partial<Usage>): Usage =>
  makeUsage({ module: 'process', path: ['binding'] }, parts);

describe('a use that a catch stops', () => {
  it('is guarded when the API exists and throws', () => {
    const { findings, guarded } = collectFindings(
      [module(binding({ guarded: true, caught: true }))],
      options,
    );
    expect(findings).toEqual([]);
    expect(guarded.map(finding => finding.api)).toEqual(['node:process.binding']);
  });

  it('is a finding when a check, not a catch, guards an API that exists and throws', () => {
    const { findings } = collectFindings([module(binding({ guarded: true }))], options);
    expect(findings).toHaveLength(1);
  });

  it('is a finding when the API only differs', () => {
    const cp = makeUsage({ module: 'fs', path: ['cp'] }, { guarded: true, caught: true });
    const { findings } = collectFindings([module(cp)], options);
    expect(findings).toHaveLength(1);
  });
});
