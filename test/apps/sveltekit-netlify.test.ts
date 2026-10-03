import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetReport } from '@/core/check.ts';
import { sampleApp, sampleAppBuilt } from '~/helpers.ts';

/**
 * A SvelteKit app built for Netlify Edge with `@sveltejs/adapter-netlify` and `edge: true`: the
 * adapter writes `.netlify/edge-functions/manifest.json` and one function, `render.js`, with a
 * sourcemap. The app is built in CI (see `apps/README.md`), so these skip when it is not built.
 */
const built = sampleAppBuilt('sveltekit-netlify', '.netlify');
const entry = '.netlify/edge-functions/render.js';

async function report(builtPath?: string): Promise<TargetReport | undefined> {
  const result = await check({
    root: sampleApp('sveltekit-netlify'),
    config: { targets: ['netlify-edge'] },
    ...(builtPath === undefined ? {} : { built: builtPath }),
  });
  return result.reports[0];
}

describe.skipIf(!built)('sveltekit on netlify-edge, from the build output', () => {
  it('finds the function from the manifest, with --built and without it', async () => {
    expect((await report('.netlify'))?.entries).toEqual([entry]);
    const auto = await report();
    expect(auto?.entries).toEqual([entry]);
    expect(auto?.target.settings).toContain('.netlify (build output)');
  });

  it('reports no error, and puts the warnings under build output', async () => {
    const found = await report('.netlify');
    expect(found?.findings.filter(finding => finding.level === 'error')).toEqual([]);
    const warnings =
      found?.findings.map(
        finding => `${finding.api} ${finding.buildOutput} ${1 + finding.otherLocations.length}`,
      ) ?? [];
    expect(warnings.toSorted()).toEqual([
      'globalThis[<expression>] true 2',
      'import(<expression>) true 1',
    ]);
  });
});
