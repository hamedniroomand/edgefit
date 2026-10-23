import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { fixture } from '~/helpers.ts';

async function resultOf(entry: string): Promise<{ found: string[]; guarded: string[] }> {
  const result = await check({
    root: fixture('global-alias-app'),
    config: { targets: ['workerd'], entry: `src/${entry}.ts` },
  });
  const names = (list: readonly { level: string; api: string }[] | undefined): string[] =>
    (list ?? []).map(finding => `${finding.level} ${finding.api}`);
  return { found: names(result.reports[0]?.findings), guarded: names(result.reports[0]?.guarded) };
}

describe('a Bun check through an alias of the global object', () => {
  it('guards the code that only Bun runs, as the check on globalThis does', async () => {
    const plain = await resultOf('plain');
    expect(plain.found.some(finding => finding.endsWith('node:dgram'))).toBe(true);
    const direct = await resultOf('direct');
    expect(direct.found).toEqual([]);
    expect(direct.guarded).toEqual(plain.found);
    expect(await resultOf('alias')).toEqual(direct);
  });

  it('reports the code when the name is set to another value', async () => {
    expect((await resultOf('reset')).found).toEqual((await resultOf('plain')).found);
  });
});
