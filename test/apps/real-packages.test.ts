import { describe, expect, it } from 'vite-plus/test';

import { run } from '@/cli/run.ts';
import { check } from '@/core/check.ts';
import { captureIo, sampleApp, sampleAppsInstalled } from '~/helpers.ts';

/**
 * Apps that install real, pinned packages (`apps/`), so the code edgefit reads is what npm
 * ships. Install them first: `vp install --frozen-lockfile` in `apps/`. CI always does; a
 * local run without them skips.
 */
const installed = sampleAppsInstalled();

describe.skipIf(!installed)('a known-bad app', () => {
  it('reports the file watching and process spawning APIs on workerd', async () => {
    const [report] = (await check({ root: sampleApp('known-bad') })).reports;
    expect(
      report?.findings.map(finding => `${finding.level} ${finding.api} ${finding.package?.name}`),
    ).toEqual([
      'error node:fs.watchFile chokidar',
      'error node:fs.unwatchFile chokidar',
      'error node:fs.watch chokidar',
      'error node:child_process.spawn cross-spawn',
      'error node:child_process.spawnSync cross-spawn',
    ]);
  });

  it('names the package, the file and the import chain', async () => {
    const [report] = (await check({ root: sampleApp('known-bad') })).reports;
    const watch = report?.findings.find(finding => finding.api === 'node:fs.watch');
    expect(watch?.package).toMatchObject({ name: 'chokidar', version: '4.0.3' });
    expect(watch?.location.file).toMatch(/chokidar\/esm\/handler\.js$/);
    expect(watch?.chain).toEqual(['src/index.js', 'chokidar']);
  });

  it.each(['bun', 'deno'] as const)('finds nothing to report on %s', async name => {
    const config = { targets: [name], entry: 'src/index.js' };
    const result = await check({ root: sampleApp('known-bad'), config });
    expect(result.reports[0]?.findings).toEqual([]);
  });

  it('shows in the compare table what only workerd lacks', async () => {
    const io = captureIo(sampleApp('known-bad'));
    await run(['compare', '--entry', 'src/index.js', '--no-color'], io);
    expect(io.output()).toContain(
      [
        'API                           workerd  bun  deno',
        'node:child_process.spawn      ✗        ✓    ✓',
        'node:child_process.spawnSync  ✗        ✓    ✓',
        'node:fs.unwatchFile           ✗        ✓    ✓',
        'node:fs.watch                 ✗        ✓    ✓',
        'node:fs.watchFile             ✗        ✓    ✓',
      ].join('\n'),
    );
  });
});

/**
 * pg reaches net, dns and Buffer, which workerd implements with nodejs_compat, and loads
 * pg-cloudflare to open sockets on Workers. Without the flag every one of those is missing.
 */
describe.skipIf(!installed)('a Postgres client', () => {
  it('reports nothing with nodejs_compat', async () => {
    const [report] = (await check({ root: sampleApp('pg-app') })).reports;
    expect(report?.findings).toEqual([]);
  });

  it('reports the Node built-ins pg needs when nodejs_compat is off', async () => {
    const config = { workerd: { compatibilityDate: '2026-04-24', compatibilityFlags: [] } };
    const [report] = (await check({ root: sampleApp('pg-app'), config })).reports;
    const apis = report?.findings.map(finding => finding.api);
    expect(apis).toEqual(expect.arrayContaining(['node:net', 'node:dns.lookup', 'Buffer.alloc']));
    const packages = report?.findings.map(finding => finding.package?.name);
    expect(packages).toEqual(expect.arrayContaining(['pg', 'pg-protocol', 'pg-cloudflare']));
  });
});
