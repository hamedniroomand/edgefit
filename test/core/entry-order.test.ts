import { describe, expect, it } from 'vite-plus/test';

import { entriesFor } from '@/core/entries.ts';
import type { Target } from '@/targets/index.ts';
import type { TargetKey } from '@/types.ts';
import { edgefitError, fixture, stubTarget } from '~/helpers.ts';

const root = fixture('entries');

const none = { exact: undefined, guess: undefined, searched: [], shared: true };
const exact = { files: ['src/main.ts'], source: 'wrangler "main"', guessed: false };
const guess = { files: ['index.ts'], source: 'index.ts', guessed: true };

function target(key: TargetKey, entries: Partial<Target['entries']>): Target {
  const stub = stubTarget();
  return { ...stub, info: { ...stub.info, key }, entries: { ...none, ...entries } };
}

describe('entry order', () => {
  it('uses an exact match before a guess, and lends only exact matches', () => {
    const found = entriesFor(
      root,
      [target('workerd', { exact }), target('bun', { guess }), target('deno', {})],
      {},
    );
    expect(found.map(item => item?.entries)).toEqual([
      ['src/main.ts'],
      ['src/main.ts'],
      ['src/main.ts'],
    ]);
    expect(found[1]?.source).toBe('workerd: wrangler "main"');
  });

  it('never lends a guess to another target, which is then skipped', () => {
    const found = entriesFor(root, [target('bun', { guess }), target('deno', {})], {});
    expect(found[0]?.entries).toEqual(['index.ts']);
    expect(found[1]).toBeUndefined();
  });

  it('keeps the guess of a target that has no exact match, and notes it', () => {
    const [found] = entriesFor(root, [target('bun', { guess })], {});
    expect(found).toMatchObject({ entries: ['index.ts'], source: 'index.ts' });
    expect(found?.note).toContain('guessed from index.ts');
  });
});

describe('targets without an entry', () => {
  it('skips a platform target that has no entry and does not let it borrow', () => {
    const found = entriesFor(
      root,
      [target('workerd', { exact }), target('vercel-edge', { shared: false })],
      {},
    );
    expect(found[0]?.entries).toEqual(['src/main.ts']);
    expect(found[1]).toBeUndefined();
  });

  it('fails when no target has an entry, and lists where each looked', async () => {
    const error = await edgefitError(
      Promise.resolve().then(() =>
        entriesFor(
          root,
          [
            target('workerd', { searched: ['wrangler "main"'] }),
            target('vercel-edge', { shared: false, searched: ['middleware.ts'] }),
          ],
          {},
        ),
      ),
    );
    expect(error.hint).toBe(
      'Searched:\n  workerd: wrangler "main"\n  vercel-edge: middleware.ts\nPass --entry, or set `entry` in edgefit.config.ts.',
    );
  });
});
