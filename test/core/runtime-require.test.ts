import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetKey } from '@/types.ts';
import { fixture } from '~/helpers.ts';

async function requireFindings(target: TargetKey): Promise<string[]> {
  const result = await check({
    root: fixture('require-app'),
    config: { targets: [target], entry: 'src/index.ts' },
  });
  return (result.reports[0]?.findings ?? []).map(
    finding =>
      `${finding.level} ${finding.category} ${finding.api} ${[finding.location, ...finding.otherLocations].map(({ line }) => line).join(' +')}`,
  );
}

describe('a require that is left for runtime', () => {
  it('is an error on vercel-edge, a warning inside try, and a static require is not reported', async () => {
    expect(await requireFindings('vercel-edge')).toEqual([
      'error unsupported require(<expression>) 2',
      'warning unknown require(<expression>) 4',
    ]);
  });

  it.each(['workerd', 'netlify-edge', 'deno-deploy'] as const)(
    'stays an unknown warning on %s',
    async target => {
      expect(await requireFindings(target)).toEqual(['warning unknown require(<expression>) 2 +4']);
    },
  );
});
