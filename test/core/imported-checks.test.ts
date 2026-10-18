import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { fixture } from '~/helpers.ts';

type Located = { location: { file: string; line: number }; otherLocations: { line: number }[] };

const lines = (found: readonly Located[]): string[] =>
  found
    .flatMap(item =>
      [item.location, ...item.otherLocations].map(
        ({ line }) => `${item.location.file.split('/').at(-1)}:${line}`,
      ),
    )
    .sort();

const run = async (entry: string): Promise<{ findings: string[]; guarded: string[] }> => {
  const { reports } = await check({
    root: fixture('imported-check-app'),
    config: { targets: ['workerd'], entry, workerd: { wranglerConfig: false } },
  });
  return { findings: lines(reports[0]?.findings ?? []), guarded: lines(reports[0]?.guarded ?? []) };
};

describe('a check in a const that another file exports, on workerd', () => {
  it.each([
    [
      'a named import, an alias and a guard clause',
      'named.mjs',
      ['named.mjs:3', 'named.mjs:4', 'named.mjs:7'],
    ],
    ['a re-export, also of an import', 'relayed.mjs', ['relayed.mjs:3', 'relayed.mjs:4']],
    ['one side of a circular import', 'circular-a.mjs', ['circular-a.mjs:4']],
    ['the other side of a circular import', 'circular-b.mjs', ['circular-b.mjs:4']],
    ['a file of a package', 'package-use.mjs', ['index.js:3']],
  ])('guards the code behind %s', async (_label, entry, guarded) => {
    expect(await run(entry)).toEqual({ findings: [], guarded });
  });

  it('keeps a finding for every form that does not export a plain const', async () => {
    const keep = Array.from({ length: 10 }, (_, index) => `keep-main.mjs:${index + 7}`).sort();
    expect(await run('keep-main.mjs')).toEqual({ findings: keep, guarded: [] });
  });

  it('keeps a finding where a local name hides the import, and in the branch the check rules out', async () => {
    expect(await run('shadowed.mjs')).toEqual({
      findings: ['shadowed.mjs:5', 'shadowed.mjs:7'],
      guarded: [],
    });
  });
});
