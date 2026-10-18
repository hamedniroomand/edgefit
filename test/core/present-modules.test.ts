import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetKey } from '@/types.ts';
import { fixture } from '~/helpers.ts';

async function findingsOn(target: TargetKey): Promise<string[]> {
  const result = await check({
    root: fixture('present-modules-app'),
    config: { entry: 'index.js', targets: [target] },
  });
  return (result.reports[0]?.findings ?? []).map(
    finding => `${finding.category} ${finding.api}: ${finding.detail}`,
  );
}

describe('a module that the matrix does not list but that loads', () => {
  it('gives no finding for the import, and keeps its members and a computed read unknown', async () => {
    expect(await findingsOn('workerd')).toEqual([
      'unknown node:worker_threads.isMainThread: is not covered by the compatibility data',
      'unknown node:v8.getHeapStatistics: is not covered by the compatibility data',
      'unknown node:v8[<expression>]: cannot be checked statically: accessed with a computed property',
    ]);
  });

  it('applies on bun to the modules its data records', async () => {
    expect(await findingsOn('bun')).toEqual([
      'unknown node:v8.getHeapStatistics: is not covered by the compatibility data',
      'unknown node:v8[<expression>]: cannot be checked statically: accessed with a computed property',
    ]);
  });
});
