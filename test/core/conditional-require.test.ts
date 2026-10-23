import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetKey } from '@/types.ts';
import { fixture } from '~/helpers.ts';

async function findingsOf(entry: string, target: TargetKey): Promise<string[]> {
  const result = await check({
    root: fixture('conditional-require-app'),
    config: { targets: [target], entry: `src/${entry}.ts` },
  });
  return (result.reports[0]?.findings ?? []).map(
    finding => `${finding.level} ${finding.category} ${finding.api}`,
  );
}

describe('a require of a conditional of strings', () => {
  it.each(['conditional', 'held'])(
    'gives the findings of the plain requires when a catch stops it (%s)',
    async entry => {
      const plain = await findingsOf('literal', 'workerd');
      expect(plain.some(finding => finding.endsWith('node:dgram'))).toBe(true);
      expect(await findingsOf(entry, 'workerd')).toEqual(plain);
    },
  );

  it('is an unknown warning on workerd and an error on vercel-edge when nothing catches it', async () => {
    expect(await findingsOf('uncaught', 'workerd')).toEqual([
      'warning unknown require(<expression>)',
    ]);
    expect(await findingsOf('uncaught', 'vercel-edge')).toEqual([
      'error unsupported require(<expression>)',
    ]);
  });
});
