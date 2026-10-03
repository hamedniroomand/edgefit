import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { CheckResult } from '@/core/check.ts';
import { checkPackage } from '@/package/check-package.ts';
import { formatJson } from '@/report/json.ts';
import { formatText } from '@/report/text.ts';
import { fixture } from '~/helpers.ts';

function project(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-supplied-'));
  mkdirSync(path.join(root, 'src'));
  mkdirSync(path.join(root, 'node_modules/views'), { recursive: true });
  writeFileSync(
    path.join(root, 'node_modules/views/package.json'),
    '{"name":"views","version":"1.0.0","main":"index.js"}',
  );
  writeFileSync(
    path.join(root, 'node_modules/views/index.js'),
    'module.exports = function load(name) {\n  return require(name);\n};\n',
  );
  writeFileSync(
    path.join(root, 'src/index.ts'),
    "import load from 'views';\nexport function own(name: string) {\n  return require(name);\n}\nexport function pick() {\n  return require(String(Math.random()));\n}\nexport { load };\n",
  );
  return root;
}

async function run(): Promise<CheckResult> {
  const result = await check({
    root: project(),
    config: { targets: ['workerd'], entry: 'src/index.ts' },
  });
  return result;
}

describe('a load of a module that the user names', () => {
  it('is a note with the package, and not a finding, in a check of a project', async () => {
    const [report] = (await run()).reports;
    expect(report?.suppliedLoads).toEqual([
      { package: 'views', place: 'index.js:2' },
      { package: undefined, place: 'index.ts:3' },
    ]);
    expect(report?.findings.map(finding => finding.location.line)).toEqual([6]);
  });

  it('is printed as a note line in the text output and listed in the JSON output', async () => {
    const result = await run();
    expect(formatText(result, { color: false })).toContain(
      'note: views loads a module the user names (index.js:2)',
    );
    const json = JSON.parse(formatJson(result)) as { targets: { suppliedLoads: unknown[] }[] };
    expect(json.targets[0]?.suppliedLoads).toHaveLength(2);
  });

  it('is a note of the entry in the package flow, and the entry passes', async () => {
    const result = await checkPackage(fixture('packages/user-named'), { targets: ['workerd'] });
    expect(result.entries[0]?.results.workerd).toEqual({
      status: 'pass',
      errors: 0,
      warnings: 0,
      notes: ['loads a module the user names (index.js:2)'],
    });
  });
});
