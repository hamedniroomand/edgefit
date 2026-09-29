import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetReport } from '@/core/check.ts';
import { fixture } from '~/helpers.ts';

/**
 * Small stand-ins for apps that are known to run on Workers. Their dependencies are copies of
 * real published code, so a change that makes edgefit report a false error or a warning nobody can
 * act on fails here.
 */
async function reportOf(name: string): Promise<TargetReport | undefined> {
  const [report] = (await check({ root: fixture(name) })).reports;
  return report;
}

describe('known-good apps', () => {
  it('a Hono app with the logger middleware reports nothing', async () => {
    const report = await reportOf('hono-app');
    expect(report?.findings).toEqual([]);
    expect(report?.guarded).toEqual([]);
  });

  it('a Nitro build with jose reports no errors and no warnings', async () => {
    const report = await reportOf('nitro-jose');
    expect(report?.findings).toEqual([]);
  });

  it('keeps jose checking for getPublicKey as a guarded usage of the package', async () => {
    const report = await reportOf('nitro-jose');
    expect(
      report?.guarded.map(
        finding => `${finding.api} ${finding.package?.name}@${finding.package?.version}`,
      ),
    ).toEqual(['crypto.subtle.getPublicKey jose@6.2.12']);
  });
});
