import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetKey } from '@/types.ts';
import { fixture } from '~/helpers.ts';

const root = fixture('process-imports');

async function apis(target: TargetKey, entry: string): Promise<string[]> {
  const [report] = (await check({ root, config: { targets: [target], entry } })).reports;
  return report?.findings.map(finding => finding.api) ?? [];
}

describe('process on vercel-edge', () => {
  it.each(['import-named.js', 'import-default.js'])(
    'reports env read through an import of node:process (%s)',
    async entry => {
      expect(await apis('vercel-edge', entry)).toEqual(['node:process.env.FOO']);
    },
  );

  it.each(['global-read.js', 'global-whole.js'])(
    'allows env on the global process (%s)',
    async entry => {
      expect(await apis('vercel-edge', entry)).toEqual([]);
    },
  );
});

describe('process on the other targets', () => {
  const entries = ['import-named.js', 'import-default.js', 'global-read.js', 'global-whole.js'];

  it.each(['workerd', 'bun', 'deno'] as const)('%s reads both forms the same way', async target => {
    const found = await Promise.all(
      entries.map(async entry => {
        const reported = await apis(target, entry);
        return reported;
      }),
    );
    expect(found).toEqual([[], [], [], []]);
  });
});
