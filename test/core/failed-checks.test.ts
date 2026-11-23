import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { collectFindings, defaultLevels } from '@/core/findings.ts';
import type { CheckCondition, Finding, TargetKey, Usage } from '@/types.ts';
import { fixture, makeUsage, stubTarget } from '~/helpers.ts';

/** The lines of the findings, and of the guarded findings, on `target` with these workerd flags. */
async function linesOn(
  target: TargetKey,
  flags: string[] = ['nodejs_compat'],
): Promise<{ findings: string[]; guarded: string[] }> {
  const result = await check({
    root: fixture('failed-check-app'),
    config: {
      entry: 'index.js',
      targets: [target],
      workerd: { compatibilityDate: '2026-11-01', compatibilityFlags: flags },
    },
  });
  const lines = (findings: readonly Finding[] = []): string[] =>
    findings.flatMap(finding =>
      [finding.location, ...finding.otherLocations].map(({ line }) => `${finding.api}:${line}`),
    );
  return {
    findings: lines(result.reports[0]?.findings),
    guarded: lines(result.reports[0]?.guarded),
  };
}

describe('the else branch of a failed && chain of checks', () => {
  it('does not run on workerd with nodejs_compat, where every check holds', async () => {
    expect(await linesOn('workerd')).toEqual({
      findings: ['WebAssembly.instantiateStreaming:19'],
      guarded: ['WebAssembly.instantiateStreaming:11'],
    });
  });

  it('runs on workerd without nodejs_compat, where process is missing', async () => {
    expect((await linesOn('workerd', ['no_nodejs_compat'])).findings).toEqual([
      'WebAssembly.instantiateStreaming:11',
      'WebAssembly.instantiateStreaming:19',
    ]);
  });
});

describe('a failed chain of checks that the data does not decide', () => {
  const target = stubTarget({ 'fs.watch': { status: 'unsupported' } }, [], ['process']);
  const failed = (failedChecks: Usage['failedChecks']): number[] => {
    const usage = makeUsage({ module: 'fs', path: ['watch'] }, { failedChecks });
    const module = { file: 'a.js', package: undefined, chain: ['a.js'], usages: [usage] };
    const { findings, guarded } = collectFindings([module], {
      target,
      levels: defaultLevels,
      ignore: [],
    });
    return [findings.length, guarded.length];
  };
  const api = (module: string, path: string[]): CheckCondition => ({
    kind: 'api',
    ref: { module, path },
    present: true,
  });

  it('counts a module, a global and the version of Node.js', () => {
    expect(failed([[api('process', []), api('process', ['versions', 'node'])]])).toEqual([0, 1]);
    expect(failed([[api('*globals*', ['fetch'])]])).toEqual([0, 1]);
  });

  it('does not count a member that the data does not list, or a value that can be falsy', () => {
    expect(failed([[api('process', ['versions', 'zzz'])]])).toEqual([1, 0]);
    expect(failed([[api('process', ['env', 'DEBUG'])]])).toEqual([1, 0]);
  });
});
