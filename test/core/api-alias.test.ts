import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { fixture } from '~/helpers.ts';

/** The APIs that `check` reports for an entry of the fixture, and the ones it guards, on workerd. */
async function reported(entry: string): Promise<[string[], string[]]> {
  const { reports } = await check({
    root: fixture('api-alias-app'),
    config: { targets: ['workerd'], entry, workerd: { wranglerConfig: false } },
  });
  return [
    (reports[0]?.findings ?? []).map(finding => finding.api),
    (reports[0]?.guarded ?? []).map(finding => finding.api),
  ];
}

describe('an API check through a name that holds the global object', () => {
  it('guards the code after the check when the name is a const', async () => {
    expect(await reported('const-alias.mjs')).toEqual([[], ['FileList.prototype']]);
  });

  it.each(['let-alias.mjs', 'var-alias.mjs'])(
    'guards nothing when the name is a let or a var (%s)',
    async entry => {
      expect(await reported(entry)).toEqual([['FileList.prototype'], []]);
    },
  );
});
