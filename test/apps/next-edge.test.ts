import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetReport } from '@/core/check.ts';
import { sampleApp, sampleAppBuilt } from '~/helpers.ts';

/**
 * A Next.js app built with `vercel build` (see `apps/README.md`): a middleware and an Edge route
 * on the Edge runtime, and a Node.js route that must not be checked. The report is read against
 * Next's own source, so the guarded findings are pinned with the reason the data gives for each.
 */
const output = '.vercel/output';
const built = sampleAppBuilt('next-edge', output);

async function report(): Promise<TargetReport | undefined> {
  const result = await check({
    root: sampleApp('next-edge'),
    built: output,
    config: { targets: ['vercel-edge'] },
  });
  return result.reports[0];
}

describe.skipIf(!built)('next.js on vercel-edge, from the build output', () => {
  it('checks the middleware and the Edge route, and leaves the Node.js route out', async () => {
    expect((await report())?.entries).toEqual([
      `${output}/functions/api/edge.func/index.js`,
      `${output}/functions/middleware.func/index.js`,
    ]);
  });

  it('reports no error, and maps findings to next through the sourcemaps', async () => {
    const found = await report();
    expect(found?.findings.filter(finding => finding.level === 'error')).toEqual([]);
    expect(found?.guarded.every(finding => finding.package?.name === 'next')).toBe(true);
  });

  it('keeps the four guarded findings, each with a reason and a source', async () => {
    const { guarded } = (await report()) ?? { guarded: [] };
    expect(guarded.map(finding => finding.api).toSorted()).toEqual([
      'clearImmediate',
      'node:process.hrtime.bigint',
      'node:process.nextTick',
      'setImmediate',
    ]);
    for (const finding of guarded) {
      expect(finding.unreached?.reason).not.toBe('');
      expect(finding.unreached?.source).toMatch(/^https:\/\/github\.com\/vercel\/next\.js\//u);
    }
  });

  // Turbopack wraps each Node.js module in `e.x("node:…", () => require(…))` and loads chunks with
  // a computed `import()`. That code is in the bundle, with no file of the project behind it.
  it('puts the code of the bundler under build output, not under your code', async () => {
    const warnings = ((await report())?.findings ?? []).filter(finding => finding.level === 'warning');
    expect(warnings.map(finding => `${finding.api} ${finding.buildOutput === true}`).toSorted()).toEqual([
      'import(<expression>) true',
      'import(<expression>) true',
      'node:async_hooks true',
      'node:async_hooks true',
      'node:buffer true',
      'node:buffer true',
    ]);
    expect(warnings.every(finding => finding.package === undefined)).toBe(true);
  });
});
