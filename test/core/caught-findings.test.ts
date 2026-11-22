import { describe, expect, it } from 'vite-plus/test';

import { collectFindings, defaultLevels } from '@/core/findings.ts';
import type { FindingOptions, ModuleUsages } from '@/core/findings.ts';
import type { LookupResult } from '@/data/dump.ts';
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

describe('a use after a call that a catch stops, in the same try block', () => {
  const hooks = { module: 'module', path: ['registerHooks'] };
  const compile = makeUsage(
    { module: 'module', path: ['Module', 'prototype', '_compile'] },
    { afterCalls: [hooks] },
  );
  const withHooks = (result: LookupResult): FindingOptions => ({
    target: stubTarget({
      'module.registerHooks': result,
      'module.Module.prototype._compile': { status: 'unsupported', note: 'throws' },
    }),
    levels: defaultLevels,
    ignore: [],
  });

  it('is guarded where the call always throws', () => {
    const { findings, guarded } = collectFindings(
      [module(compile)],
      withHooks({ status: 'unsupported', note: 'throws ERR_METHOD_NOT_IMPLEMENTED' }),
    );
    expect(findings).toEqual([]);
    expect(guarded.map(finding => finding.api)).toEqual(['node:module.Module.prototype._compile']);
  });

  it('is guarded where the called API is missing', () => {
    const { findings } = collectFindings(
      [module(compile)],
      withHooks({ status: 'unsupported', absent: true }),
    );
    expect(findings).toEqual([]);
  });

  it('is a finding where the call returns', () => {
    const { findings } = collectFindings([module(compile)], withHooks({ status: 'supported' }));
    expect(findings.map(finding => finding.api)).toEqual(['node:module.Module.prototype._compile']);
  });

  it('is a finding where the call throws only for some options', () => {
    const { findings } = collectFindings(
      [module(compile)],
      withHooks({ status: 'unsupported', options: ['http2'] }),
    );
    expect(findings).toHaveLength(1);
  });
});

describe('a member read after a load that a catch stops when the module is missing', () => {
  const sqlite = (results: Parameters<typeof stubTarget>[0]): FindingOptions => ({
    target: stubTarget(results),
    levels: defaultLevels,
    ignore: [],
  });
  const member = makeUsage({ module: 'sqlite', path: ['DatabaseSync'] }, { afterLoad: true });
  const missing = { status: 'unsupported', absent: true } as const;

  it('is guarded when the target lacks the whole module', () => {
    const { findings, guarded } = collectFindings(
      [module(member)],
      sqlite({ sqlite: missing, 'sqlite.DatabaseSync': missing }),
    );
    expect(findings).toEqual([]);
    expect(guarded.map(finding => finding.api)).toEqual(['node:sqlite.DatabaseSync']);
  });

  it('is a finding when the target has the module but lacks the member', () => {
    const { findings } = collectFindings(
      [module(member)],
      sqlite({ 'sqlite.DatabaseSync': missing }),
    );
    expect(findings.map(finding => finding.api)).toEqual(['node:sqlite.DatabaseSync']);
  });
});
