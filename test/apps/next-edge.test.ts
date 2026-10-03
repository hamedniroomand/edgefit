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
      `${output}/functions/api/timers.func/index.js`,
      `${output}/functions/middleware.func/index.js`,
    ]);
  });

  // Turbopack loads a Node.js module as `e.x("node:timers", () => require("node:timers"), !0)`, and a
  // lazy import as `Promise.resolve().then(() => …)` around it. Both bind to the module, so a read
  // from a module Vercel lacks is reported in the bundle, at the file that wrote it.
  it('reports the reads of a Node.js module Vercel lacks, at the files that wrote them', async () => {
    const found = await report();
    const errors = found?.findings.filter(finding => finding.level === 'error') ?? [];
    expect(errors.map(finding => `${finding.api} ${finding.location.file}`).toSorted()).toEqual([
      'node:timers.setTimeout app/api/timers/route.js',
      'node:timers.setTimeout middleware.js',
    ]);
    expect(errors.every(finding => finding.package === undefined && finding.buildOutput === undefined)).toBe(true);
  });

  it('maps the guarded findings to next through the sourcemaps', async () => {
    expect((await report())?.guarded.every(finding => finding.package?.name === 'next')).toBe(true);
  });

  // Edge functions lack FinalizationRegistry and WeakRef. Next checks for FinalizationRegistry itself,
  // and calls WeakRef only inside that check, which data/unreached.json records.
  it('keeps the guarded findings, each unreached one with a reason and a source', async () => {
    const { guarded } = (await report()) ?? { guarded: [] };
    expect(guarded.map(finding => finding.api).toSorted()).toEqual([
      'FinalizationRegistry',
      'WeakRef',
      'clearImmediate',
      'node:process.hrtime.bigint',
      'node:process.nextTick',
      'setImmediate',
    ]);
    const unreached = guarded.filter(finding => finding.api !== 'FinalizationRegistry');
    for (const finding of unreached) {
      expect(finding.unreached?.reason).not.toBe('');
      expect(finding.unreached?.source).toMatch(/^https:\/\/github\.com\/vercel\/next\.js\//u);
    }
  });

  // Turbopack wraps each Node.js module in `e.x("node:…", () => require(…))` and loads chunks with
  // a computed `import()`. That code is in the bundle, with no file of the project behind it.
  it('puts the code of the bundler under build output, not under your code', async () => {
    const warnings = ((await report())?.findings ?? []).filter(finding => finding.level === 'warning');
    const owners = warnings.map(
      finding =>
        `${finding.api} ${finding.buildOutput === true} ${1 + finding.otherLocations.length}`,
    );
    expect(owners.toSorted()).toEqual([
      'import(<expression>) true 3',
      'node:async_hooks true 3',
      'node:buffer true 3',
    ]);
    expect(warnings.every(finding => finding.package === undefined)).toBe(true);
  });
});
