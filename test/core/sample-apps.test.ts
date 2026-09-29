import { describe, expect, it } from 'vite-plus/test';

import { run } from '@/cli/run.ts';
import { check } from '@/core/check.ts';
import type { TargetReport } from '@/core/check.ts';
import { captureIo, fixture } from '~/helpers.ts';

/**
 * Small stand-ins for apps that are known to run on Workers. Their dependencies are copies of
 * real published code, so a change that makes edgefit report a false error or a warning nobody can
 * act on fails here.
 */
async function reportOf(name: string): Promise<TargetReport | undefined> {
  const [report] = (await check({ root: fixture(name) })).reports;
  return report;
}

describe('known-good apps', () => {
  it('a Hono app with the logger middleware reports nothing', async () => {
    const report = await reportOf('hono-app');
    expect(report?.findings).toEqual([]);
    expect(report?.guarded).toEqual([]);
  });

  it('a Nitro build with jose reports no errors and no warnings', async () => {
    const report = await reportOf('nitro-jose');
    expect(report?.findings).toEqual([]);
  });

  it('attributes the auth library and jose in one chunk to their own packages', async () => {
    const [report] = (await check({ root: fixture('nitro-jose'), includeSupported: true })).reports;
    const digest = report?.supported.filter(api => api.api === 'crypto.subtle.digest');
    expect(digest?.map(api => api.package?.name)).toEqual(['oauth4webapi']);
    expect(report?.supported.some(api => api.package?.name === 'jose')).toBe(true);
  });

  it('keeps jose checking for getPublicKey as a guarded usage of the package', async () => {
    const report = await reportOf('nitro-jose');
    expect(
      report?.guarded.map(
        finding => `${finding.api} ${finding.package?.name}@${finding.package?.version}`,
      ),
    ).toEqual(['crypto.subtle.getPublicKey jose@6.2.12']);
  });
});

describe('known-good apps without nodejs_compat', () => {
  it('a Hono app checks for process before it uses it, so it reports nothing', async () => {
    const config = { workerd: { compatibilityDate: '2026-05-20', compatibilityFlags: [] } };
    const [report] = (await check({ root: fixture('hono-app'), config })).reports;
    expect(report?.target.notes.join(' ')).toContain('nodejs_compat is not enabled');
    expect(report?.findings).toEqual([]);
  });
});

/** The same app checked on every target: the compare table must agree with each single check. */
describe('compare across targets', () => {
  async function compare(name: string, argv: string[]): Promise<string> {
    const io = captureIo(fixture(name));
    await run(['compare', '--entry', 'src/index.js', '--no-color', ...argv], io);
    return io.output();
  }

  it('shows no unsupported or mismatched API for the Hono app', async () => {
    const output = JSON.parse(await compare('hono-app', ['--all', '--format', 'json'])) as {
      targets: string[];
      apis: { results: Record<string, string> }[];
    };
    const results = output.apis.flatMap(row => Object.values(row.results));
    expect(output.targets).toEqual(['workerd', 'bun', 'deno']);
    expect(results.length).toBeGreaterThan(0);
    expect(new Set(results)).toEqual(new Set(['supported']));
  });
});

/**
 * The layout of an adapter's `_worker.js` directory (SvelteKit, Astro). Nothing marks it as build
 * output, so it is scanned with `built`, as the docs say.
 */
describe('an adapter _worker.js directory', () => {
  it('finds the entry in the directory and follows its chunks', async () => {
    const built = '.svelte-kit/cloudflare';
    const [report] = (await check({ root: fixture('adapter-worker'), built })).reports;
    expect(report?.entry).toBe('.svelte-kit/cloudflare/_worker.js/index.js');
    expect(report?.findings.map(finding => finding.api)).toEqual(['node:fs.watch']);
  });
});
