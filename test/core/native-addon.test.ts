import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetReport } from '@/core/check.ts';
import type { Finding, TargetKey } from '@/types.ts';
import { fixture } from '~/helpers.ts';

async function addonReport(target: TargetKey): Promise<TargetReport | undefined> {
  const result = await check({
    root: fixture('native-app'),
    config: { targets: [target], entry: 'src/index.ts' },
  });
  return result.reports[0];
}

function describeAll(findings: readonly Finding[] = []): string[] {
  return findings.map(
    finding =>
      `${finding.level} ${finding.api} ${finding.location.file}:${finding.location.line} ${finding.chain.join(' > ')}`,
  );
}

async function addonFindings(target: TargetKey): Promise<string[]> {
  return describeAll((await addonReport(target))?.findings);
}

const rejected = [
  'error native addon addon.node src/index.ts:1 src/index.ts',
  'error native addon binding.node node_modules/with-addon/index.js:1 src/index.ts > with-addon',
];

describe('native addons', () => {
  it.each(['workerd', 'vercel-edge', 'netlify-edge', 'deno-deploy'] as const)(
    'reports a direct and a packaged addon as errors on %s',
    async target => {
      expect(await addonFindings(target)).toEqual(rejected);
    },
  );

  it.each(['bun', 'deno'] as const)('reports no finding on %s', async target => {
    expect(await addonFindings(target)).toEqual([]);
  });

  it('keeps an addon that a try block catches out of the findings', async () => {
    const report = await addonReport('workerd');
    expect(describeAll(report?.guarded)).toEqual([
      'error native addon try.node node_modules/try-addon/index.js:3 src/index.ts > try-addon',
    ]);
  });
});
