import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { extractModule } from '@/extract/index.ts';
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
    expect(report?.guarded.map(finding => finding.api)).toEqual(['Buffer.isBuffer', 'Buffer.from']);
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
    expect(result.reports[0]?.entries).toEqual([entry]);
    expect(result.reports[0]?.findings).toEqual([]);
  });
});

/**
 * Next.js middleware, the main use of vercel-edge, with next installed from npm. Next branches
 * on `process.env.NEXT_RUNTIME`, which its edge build replaces with 'edge', so the Node-only
 * branches must be guarded, not errors. `next/server` is a CommonJS barrel that requires the
 * server rendering code for exports the middleware never imports, so that code is not reached:
 * `process.cwd` sits in a function of `dynamic-rendering.js` that only app rendering calls, and
 * the guarded `process.nextTick` and `setImmediate` uses sit in the same code. That needs the
 * barrel and the modules it reaches to be read by export name, which the second test pins. The
 * guarded usage that remains is pinned so a change is noticed. React's development build, which
 * has `MessageChannel`, is not reached, because `process.env.NODE_ENV` is `production`.
 */
describe.skipIf(!installed)('next.js middleware on vercel-edge', () => {
  const root = sampleApp('next-middleware');

  it('reports nothing, and keeps only the guarded use that is reached', async () => {
    const result = await check({ root, config: { targets: ['vercel-edge'] } });
    const [report] = result.reports;
    expect(report?.entries).toEqual(['middleware.ts']);
    expect(report?.findings).toEqual([]);
    expect(report?.guarded.map(finding => finding.api)).toEqual(['node:process.emit', 'reportError']);
  });

  it.each([
    'server.js',
    'dist/server/request/connection.js',
    'dist/server/app-render/dynamic-rendering.js',
  ])('reads next/%s by export name, not in full', async file => {
    const source = await readFile(join(root, 'node_modules/next', file), 'utf8');
    const { shape } = extractModule(file, source, {
      globals: new Set(),
      shape: true,
      nodeEnv: 'production',
    });
    expect(shape?.traceable).toBe(true);
  });
});
