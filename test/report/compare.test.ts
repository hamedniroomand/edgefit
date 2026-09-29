import { describe, expect, it } from 'vite-plus/test';

import type { CheckResult, TargetReport } from '@/core/check.ts';
import { compareRows } from '@/report/compare.ts';
import type { Category, Finding, PackageInfo, TargetKey } from '@/types.ts';

const pg: PackageInfo = { name: 'pg', version: '8.0.0' };

function finding(api: string, category: Category, owner?: PackageInfo): Finding {
  return {
    category,
    level: 'error',
    api,
    target: 'workerd',
    message: `${api} is ${category}`,
    detail: `is ${category}`,
    package: owner,
    location: { file: 'src/index.ts', line: 1, column: 1 },
    otherLocations: [],
    chain: ['src/index.ts'],
  };
}

function report(key: TargetKey, parts: Partial<TargetReport>): TargetReport {
  return {
    target: { key, platform: key, conditions: [], data: '', settings: '', notes: [] },
    entry: 'src/index.ts',
    modules: 1,
    findings: [],
    guarded: [],
    ignored: 0,
    supported: [],
    ...parts,
  };
}

const result: CheckResult = {
  root: '/project',
  reports: [
    report('workerd', {
      findings: [
        finding('node:fs.watch', 'unknown'),
        finding('node:fs.watch', 'unsupported', pg),
        finding('node:net.connect', 'mocked', pg),
      ],
      supported: [{ api: 'node:fs.readFile', package: undefined }],
    }),
    report('bun', {
      supported: [
        { api: 'node:fs.watch', package: undefined },
        { api: 'node:fs.readFile', package: undefined },
      ],
    }),
  ],
};

describe('compare rows', () => {
  it('lists APIs with a finding on any target, with every target that reaches them', () => {
    const rows = compareRows(result, { all: false });
    expect(rows.map(({ api, packages, results }) => ({ api, packages, results }))).toEqual([
      {
        api: 'node:fs.watch',
        packages: ['pg@8.0.0', 'your code'],
        results: { workerd: 'unsupported', bun: 'supported' },
      },
      { api: 'node:net.connect', packages: ['pg@8.0.0'], results: { workerd: 'mocked' } },
    ]);
  });

  it('keeps the findings behind a row', () => {
    expect(compareRows(result, { all: false })[0]?.findings).toHaveLength(2);
  });

  it('adds APIs every target supports with all', () => {
    expect(compareRows(result, { all: true }).map(row => row.api)).toEqual([
      'node:fs.readFile',
      'node:fs.watch',
      'node:net.connect',
    ]);
  });
});
