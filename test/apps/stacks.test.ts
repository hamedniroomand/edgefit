import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { sampleApp, sampleAppsInstalled } from '~/helpers.ts';

/**
 * The common ways to build on Workers, as installed from npm. They must report nothing with
 * nodejs_compat. Without it, an error must be a real unguarded use, read against the package.
 */
const installed = sampleAppsInstalled();
const withoutCompat = { workerd: { compatibilityDate: '2026-04-24', compatibilityFlags: [] } };

describe.skipIf(!installed).each(['hono-starter', 'hono-zod', 'drizzle-d1'])('%s', name => {
  it('reports nothing with nodejs_compat', async () => {
    const [report] = (await check({ root: sampleApp(name) })).reports;
    expect(report?.findings).toEqual([]);
  });
});

describe.skipIf(!installed)('without nodejs_compat', () => {
  it.each(['hono-starter', 'hono-zod'])('%s still reports nothing', async name => {
    const [report] = (await check({ root: sampleApp(name), config: withoutCompat })).reports;
    expect(report?.findings).toEqual([]);
  });

  // drizzle-orm's blob columns call Buffer.from and Buffer.isBuffer without checking for Buffer
  // (sqlite-core/columns/blob.js). Its other uses are guarded and stay out of the findings.
  it('drizzle-orm reports the unguarded Buffer uses of its blob columns', async () => {
    const [report] = (await check({ root: sampleApp('drizzle-d1'), config: withoutCompat })).reports;
    expect(report?.findings.map(finding => `${finding.api} ${finding.package?.name}`)).toEqual([
      'Buffer.from drizzle-orm',
      'Buffer.isBuffer drizzle-orm',
    ]);
    expect(report?.guarded.map(finding => finding.api)).toEqual(['Buffer.from', 'Buffer.isBuffer']);
  });
});
