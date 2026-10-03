import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { EdgefitConfig } from '@/types.ts';
import { fixture } from '~/helpers.ts';

describe('a package that loads a module inside a function', () => {
  async function apiOf(entry: string): Promise<string[]> {
    const config: EdgefitConfig = {
      targets: ['workerd'],
      entry,
      workerd: { wranglerConfig: false },
    };
    const result = await check({ root: fixture('lazy-server-app'), config });
    return (result.reports[0]?.findings ?? []).map(finding => `${finding.category} ${finding.api}`);
  }

  it('has no finding for an export that does not load it', async () => {
    expect(await apiOf('src/connect.mjs')).toEqual([]);
  });

  it('has the finding of the module for the export that loads it', async () => {
    expect(await apiOf('src/serve.mjs')).toEqual(['mismatch node:net.createServer']);
  });
});
