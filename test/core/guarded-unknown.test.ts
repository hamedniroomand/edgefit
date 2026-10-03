import { expect, it } from 'vite-plus/test';

import { collectFindings, defaultLevels } from '@/core/findings.ts';
import type { FindingOptions, ModuleUsages } from '@/core/findings.ts';
import type { Usage } from '@/types.ts';
import { makeUsage, stubTarget } from '~/helpers.ts';

const target = stubTarget({ 'fs.watch': { status: 'uncovered' } });
const options: FindingOptions = { target, levels: defaultLevels, ignore: [] };

const usage = (file: string, extra: Partial<Usage> = {}): ModuleUsages => ({
  file,
  package: undefined,
  chain: [file],
  usages: [
    makeUsage(
      { module: 'fs', path: ['watch'] },
      { location: { file, line: 1, column: 1 }, ...extra },
    ),
  ],
});

it('sets a guarded usage of an API that the data does not cover apart from the findings', () => {
  const { findings, guarded } = collectFindings(
    [usage('a.js', { guarded: true }), usage('b.js')],
    options,
  );
  expect(findings.map(finding => finding.location.file)).toEqual(['b.js']);
  expect(guarded.map(finding => finding.location.file)).toEqual(['a.js']);
});

it('keeps a guarded access that cannot be checked as a finding', () => {
  const { findings, guarded } = collectFindings(
    [
      {
        file: 'a.js',
        package: undefined,
        chain: ['a.js'],
        usages: [
          makeUsage(
            { module: 'fs', path: ['watch'] },
            {
              kind: 'dynamic',
              api: undefined,
              guarded: true,
              location: { file: 'a.js', line: 1, column: 1 },
            },
          ),
        ],
      },
    ],
    options,
  );
  expect(findings).toHaveLength(1);
  expect(guarded).toEqual([]);
});

it('hides an unknown module when a member of it is guarded', () => {
  const unknownModule = stubTarget({
    'fs.watch': { status: 'uncovered' },
    fs: { status: 'uncovered' },
  });
  const file = usage('a.js', { guarded: true });
  const bare = makeUsage(
    { module: 'fs', path: [] },
    { location: { file: 'a.js', line: 1, column: 1 } },
  );
  const { findings, guarded } = collectFindings([{ ...file, usages: [bare, ...file.usages] }], {
    ...options,
    target: unknownModule,
  });
  expect(findings).toEqual([]);
  expect(guarded.map(finding => finding.api)).toEqual(['node:fs.watch']);
});
