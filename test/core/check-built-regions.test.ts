import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetReport } from '@/core/check.ts';
import type { EdgefitConfig } from '@/types.ts';
import { fixture } from '~/helpers.ts';

async function reportFor(config: EdgefitConfig = {}): Promise<TargetReport | undefined> {
  const [report] = (await check({ root: fixture('nitro-libs'), config })).reports;
  return report;
}

describe('build output without sourcemaps', () => {
  it('is recognized from nitro.json and named by the region markers', async () => {
    const report = await reportFor();
    expect(
      report?.findings.map(
        finding => `${finding.api} ${finding.package?.name}@${finding.package?.version}`,
      ),
    ).toEqual(['navigator.locks.request jose@6.2.12', 'navigator.locks.request task-lock@2.1.0']);
  });

  it('keeps the location in the output, since the original line is unknown', async () => {
    const report = await reportFor();
    expect(report?.findings[0]?.location).toMatchObject({
      file: '.output/server/_libs/jose+task-lock+[...].mjs',
      line: 3,
    });
    expect(report?.findings[0]?.chain.at(-1)).toBe('jose');
  });

  it('lets an ignore rule name the package', async () => {
    const report = await reportFor({ ignore: [{ package: 'jose' }] });
    expect(report?.findings.map(finding => finding.package?.name)).toEqual(['task-lock']);
    expect(report?.ignored).toBe(1);
  });

  it('says the findings point into the build output', async () => {
    const report = await reportFor();
    expect(report?.target.notes).toEqual([expect.stringContaining('sourcemap: true')]);
  });

  it('does not treat a project without nitro.json as build output', async () => {
    const [report] = (await check({ root: fixture('worker') })).reports;
    expect(report?.target.notes).toEqual([]);
  });
});

describe('a Nitro output found through the deploy redirect', () => {
  it('needs no entry or wrangler config in the project root', async () => {
    const [report] = (await check({ root: fixture('nitro-redirect') })).reports;
    expect(report?.entries).toEqual(['.output/server/index.mjs']);
    expect(report?.target.settings).toContain('from .output/server/wrangler.json');
  });
});
