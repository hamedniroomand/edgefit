import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetKey } from '@/types.ts';
import { fixture } from '~/helpers.ts';

async function resultOf(
  entry: string,
  target: TargetKey,
): Promise<{ found: string[]; guarded: string[] }> {
  const result = await check({
    root: fixture('page-function-app'),
    config: { targets: [target], entry: `${entry}.mjs` },
  });
  const names = (list: readonly { level: string; api: string }[] | undefined): string[] =>
    (list ?? []).map(finding => `${finding.level} ${finding.api}`);
  return { found: names(result.reports[0]?.findings), guarded: names(result.reports[0]?.guarded) };
}

describe('a function that is sent to a browser page', () => {
  it.each(['workerd', 'bun', 'deno'] as const)('is guarded on %s', async target => {
    expect(await resultOf('page', target)).toEqual({
      found: [],
      guarded: ['warning globalThis[<expression>]'],
    });
  });

  it.each(['workerd', 'bun', 'deno'] as const)(
    'is a warning on %s in code of the caller',
    async target => {
      expect(await resultOf('host', target)).toEqual({
        found: ['warning globalThis[<expression>]'],
        guarded: [],
      });
    },
  );
  it.each(['workerd', 'bun', 'deno'] as const)(
    'guards a function that only the page function calls, on %s',
    async target => {
      expect(await resultOf('called', target)).toEqual({
        found: [],
        guarded: ['warning globalThis[<expression>]'],
      });
    },
  );

  it.each(['workerd', 'bun', 'deno'] as const)(
    'keeps a function that only another function calls, on %s',
    async target => {
      expect((await resultOf('two-hops', target)).found).toEqual([
        'warning globalThis[<expression>]',
      ]);
    },
  );
});
