import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { EntryDetection } from '@/targets/entries.ts';
import { createTarget } from '@/targets/index.ts';
import type { TargetKey } from '@/types.ts';
import { edgefitError, fixture } from '~/helpers.ts';

const detect = (key: TargetKey, name: string): EntryDetection =>
  createTarget(key, fixture(`entry-detection/${name}`), { workerd: { wranglerConfig: false } })
    .entries;

describe('Bun entries', () => {
  it('reads package.json module as a declaration', () => {
    expect(detect('bun', 'bun-module').exact).toEqual({
      files: ['src/server.ts'],
      source: 'package.json "module"',
      guessed: false,
    });
  });

  it('guesses from the start script, then the dev script, then index.ts', () => {
    expect(detect('bun', 'bun-start').guess).toMatchObject({
      files: ['src/app.ts'],
      source: 'package.json scripts.start',
    });
    expect(detect('bun', 'bun-dev').guess).toMatchObject({
      files: ['src/dev.ts'],
      source: 'package.json scripts.dev',
    });
    expect(detect('bun', 'bun-index').guess).toMatchObject({
      files: ['index.ts'],
      source: 'index.ts',
    });
  });

  it('does not take a guess for a declaration', () => {
    expect(detect('bun', 'bun-start').exact).toBeUndefined();
  });
});

describe('Deno entries', () => {
  it('reads every file of deno.json exports and skips one that is missing', () => {
    expect(detect('deno', 'deno-exports').exact).toEqual({
      files: ['mod.ts', 'extra.ts'],
      source: 'deno.json "exports"',
      guessed: false,
    });
  });

  it('guesses from the tasks, then main.ts, for deno and deno-deploy', () => {
    expect(detect('deno', 'deno-task').guess).toMatchObject({
      files: ['server.ts'],
      source: 'deno.json tasks.dev',
    });
    expect(detect('deno-deploy', 'deno-task').guess?.files).toEqual(['server.ts']);
    expect(detect('deno', 'deno-main').guess).toMatchObject({
      files: ['main.ts'],
      source: 'main.ts',
    });
  });
});

describe('the shared fallback', () => {
  it('reads main as a declaration, for workerd without a wrangler config', () => {
    expect(detect('workerd', 'fallback-main').exact?.files).toEqual(['src/lib.js']);
  });

  it('takes only the "." entry of exports', () => {
    expect(detect('workerd', 'fallback-exports').exact?.files).toEqual(['src/main.mjs']);
  });

  it('skips a field that names a missing file, and falls back to src/index.*', () => {
    const entries = detect('workerd', 'fallback-missing');
    expect(entries.exact).toBeUndefined();
    expect(entries.guess).toMatchObject({
      files: ['src/index.ts'],
      source: 'src/index.* or index.*',
    });
  });

  it('guesses when a field names build output', () => {
    const entries = detect('workerd', 'fallback-built');
    expect(entries.exact).toBeUndefined();
    expect(entries.guess).toMatchObject({ files: ['dist/index.js'], guessed: true });
    expect(entries.guess?.source).toContain('(build output)');
  });
});

describe('workspace roots', () => {
  it.each(['workspace-npm', 'workspace-pnpm', 'workspace-deno'])(
    'does not guess an entry at the root of %s',
    name => {
      for (const key of ['bun', 'deno', 'workerd'] as const) {
        const entries = detect(key, name);
        expect(entries.exact).toBeUndefined();
        expect(entries.guess).toBeUndefined();
        expect(entries.searched.join('\n')).toContain('(not used at a workspace root)');
      }
    },
  );

  it('fails with the places it searched', async () => {
    const error = await edgefitError(
      check({ root: fixture('entry-detection/workspace-pnpm'), config: { targets: ['bun'] } }),
    );
    expect(error.message).toBe('No entry point to scan.');
    expect(error.hint).toContain('bun: package.json "module", package.json scripts.start');
    expect(error.hint).toContain('index.ts (not used at a workspace root)');
  });
});

describe('guessed entries in a report', () => {
  it('names the source and says the entries were guessed', async () => {
    const result = await check({
      root: fixture('entry-detection/bun-start'),
      config: { targets: ['bun'] },
    });
    const [report] = result.reports;
    expect(report?.entries).toEqual(['src/app.ts']);
    expect(report?.target.settings).toContain('entries from package.json scripts.start');
    expect(report?.target.notes.join('\n')).toContain('guessed from package.json scripts.start');
  });
});

describe('Vercel entries', () => {
  it('takes the middleware and every route that sets the Edge runtime', () => {
    expect(detect('vercel-edge', 'vercel-routes').exact?.files).toEqual([
      'middleware.ts',
      'api/edge.ts',
      'app/foo/route.ts',
      'src/pages/api/x.ts',
    ]);
  });

  it('takes routes when there is no middleware', () => {
    expect(detect('vercel-edge', 'vercel-routes-only').exact?.files).toEqual(['api/edge.ts']);
  });
});

describe('Netlify entries', () => {
  it('takes functions that route themselves with an inline config, before the whole directory', () => {
    const { exact } = detect('netlify-edge', 'netlify-inline');
    expect(exact?.files).toEqual(['netlify/edge-functions/a.ts', 'netlify/edge-functions/c.ts']);
    expect(exact?.source).toContain('[[edge_functions]] in netlify.toml');
  });
});
