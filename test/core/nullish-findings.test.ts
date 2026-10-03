import { expect, it } from 'vite-plus/test';

import { collectFindings, defaultLevels } from '@/core/findings.ts';
import type { FindingOptions } from '@/core/findings.ts';
import { extractUsages } from '@/extract/index.ts';
import { stubTarget } from '~/helpers.ts';

const source = "import fs from 'node:fs';\nconst w = fs.watch || other;\n";
const usages = extractUsages('a.js', source, { globals: new Set(), nodeEnv: 'production' });
const report = (target: FindingOptions['target']): ReturnType<typeof collectFindings> =>
  collectFindings([{ file: 'a.js', package: undefined, chain: ['a.js'], usages }], {
    target,
    levels: defaultLevels,
    ignore: [],
  });

it('hides the read when the target lacks the API, and keeps it when the API exists and throws', () => {
  const lacks = stubTarget({
    'fs.watch': { status: 'unsupported', note: 'does not exist', absent: true },
  });
  const throws = stubTarget({ 'fs.watch': { status: 'unsupported', note: 'exists, but throws' } });
  expect(report(lacks).findings).toEqual([]);
  expect(report(lacks).guarded.map(finding => finding.api)).toEqual(['node:fs.watch']);
  expect(report(throws).findings.map(finding => finding.api)).toEqual(['node:fs.watch']);
});
