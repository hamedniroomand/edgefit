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

/**
 * Hono as it is deployed to the Edge platforms, installed from npm. Nothing here needs a Node
 * module Vercel would refuse or Deno lacks, so both must report nothing, and the entry must be
 * found from the platform's own config (`netlify.toml`, `middleware.ts`).
 */
describe.skipIf(!installed).each([
  ['netlify-edge', 'netlify-edge', 'netlify/edge-functions/app.ts'],
  ['vercel-edge', 'vercel-edge', 'middleware.ts'],
] as const)('hono on %s', (target, name, entry) => {
  it('reports nothing, from the entry the platform config names', async () => {
    const result = await check({ root: sampleApp(name), config: { targets: [target] } });
    expect(result.reports[0]?.entry).toBe(entry);
    expect(result.reports[0]?.findings).toEqual([]);
  });
});

/**
 * Next.js middleware, the main use of vercel-edge, with next installed from npm. Next branches
 * on `process.env.NEXT_RUNTIME`, which its edge build replaces with 'edge', so the Node-only
 * branches (`process.nextTick`, `setImmediate`) must be guarded, not errors. Two findings remain
 * and are pinned here so a change is noticed; neither is something the middleware runs:
 * - `process.cwd` is in next's server rendering code, reached through the CommonJS barrel of
 *   `next/server`, which is checked in full.
 * - `MessageChannel` is in React's development build, which every bundler drops for production.
 *   edgefit follows `process.env.NODE_ENV !== 'production'` branches on every target.
 */
describe.skipIf(!installed)('next.js middleware on vercel-edge', () => {
  it('guards what the edge build removes and reports only the two known leftovers', async () => {
    const result = await check({
      root: sampleApp('next-middleware'),
      config: { targets: ['vercel-edge'] },
    });
    const [report] = result.reports;
    expect(report?.entry).toBe('middleware.ts');
    expect(report?.findings.map(finding => finding.api)).toEqual([
      'node:process.cwd',
      'MessageChannel',
    ]);
    expect(report?.guarded.map(finding => finding.api)).toEqual(
      expect.arrayContaining(['node:process.nextTick', 'setImmediate']),
    );
  });
});
