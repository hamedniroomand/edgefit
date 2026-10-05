import { describe, expect, it } from 'vite-plus/test';

import { collectFindings, defaultLevels } from '@/core/findings.ts';
import type { FindingOptions, ModuleUsages } from '@/core/findings.ts';
import type { Usage } from '@/types.ts';
import { makeUsage, stubTarget } from '~/helpers.ts';

const missing = { status: 'unsupported', absent: true } as const;
const targetWith = (
  results: Parameters<typeof stubTarget>[0],
  globals: readonly string[],
): FindingOptions => ({
  target: stubTarget({ 'process.binding': { status: 'unsupported' }, ...results }, [], globals),
  levels: defaultLevels,
  ignore: [],
});
const module = (usage: Usage): ModuleUsages => ({
  file: 'a.js',
  package: undefined,
  chain: ['a.js'],
  usages: [usage],
});
const binding = (globals: Usage['globals']): ModuleUsages =>
  module(makeUsage({ module: 'process', path: ['binding'] }, { globals }));
const count = (usages: ModuleUsages, options: FindingOptions): number[] => {
  const { findings, guarded } = collectFindings([usages], options);
  return [findings.length, guarded.length];
};

describe('code behind a check for a global', () => {
  it('is guarded when the global is present and the code runs only without it', () => {
    const options = targetWith({ '*globals*.crypto': { status: 'supported' } }, ['crypto']);
    expect(count(binding([{ name: 'crypto', present: false }]), options)).toEqual([0, 1]);
  });

  it('is guarded when the global is absent and the code runs only with it', () => {
    const options = targetWith({ '*globals*.FileList': missing }, []);
    expect(count(binding([{ name: 'FileList', present: true }]), options)).toEqual([0, 1]);
  });

  it('is a finding where the target has the global and the code needs it', () => {
    const options = targetWith({ '*globals*.crypto': { status: 'supported' } }, ['crypto']);
    expect(count(binding([{ name: 'crypto', present: true }]), options)).toEqual([1, 0]);
  });

  it('is a finding where the target lacks the global and the code needs it missing', () => {
    const options = targetWith({ '*globals*.FileList': missing }, []);
    expect(count(binding([{ name: 'FileList', present: false }]), options)).toEqual([1, 0]);
  });

  it('is a finding when the data does not name the global', () => {
    for (const globals of [[], ['Odd']]) {
      const options = targetWith({ '*globals*.Odd': { status: 'uncovered' } }, globals);
      expect(count(binding([{ name: 'Odd', present: true }]), options)).toEqual([1, 0]);
      expect(count(binding([{ name: 'Odd', present: false }]), options)).toEqual([1, 0]);
    }
  });
});
