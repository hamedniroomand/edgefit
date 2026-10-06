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
      'error node:fs.watch chokidar',
      'error node:fs.unwatchFile chokidar',
      'error node:fs.watchFile chokidar',
      'error node:child_process.spawn cross-spawn',
      'error node:child_process.spawnSync cross-spawn',
    ]);
  });

  it('suggests a fix for each finding, from the package or the API', async () => {
    const [report] = (await check({ root: sampleApp('known-bad') })).reports;
    expect(
      report?.findings.map(finding => `${finding.api} ${finding.suggestion?.text.split(' ').slice(0, 2).join(' ')}`),
    ).toEqual([
      'node:fs.watch chokidar watches',
      'node:fs.unwatchFile chokidar watches',
      'node:fs.watchFile chokidar watches',
      'node:child_process.spawn cross-spawn starts',
      'node:child_process.spawnSync cross-spawn starts',
    ]);
    for (const finding of report?.findings ?? []) {
      expect(finding.suggestion).toMatchObject({ target: 'workerd', kind: 'change' });
      expect(finding.suggestion?.source).toMatch(/^https:\/\//u);
    }
  });

  it('names the package, the file and the import chain', async () => {
    const [report] = (await check({ root: sampleApp('known-bad') })).reports;
    const watch = report?.findings.find(finding => finding.api === 'node:fs.watch');
    expect(watch?.package).toMatchObject({ name: 'chokidar', version: '5.0.0' });
    expect(watch?.location.file).toMatch(/chokidar\/handler\.js$/);
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
 * The same app on the Edge platforms. Netlify runs Deno, which has everything chokidar reaches,
 * but blocks subprocesses, so cross-spawn's child_process is an error. Vercel allows five modules, so every other one is an error: the watcher's
 * fs, path, os, process and stream, and the spawner's child_process, which the matrix does not
 * cover and the override layer has to catch. `events`, which chokidar also imports, is allowed.
 */
describe.skipIf(!installed)('a known-bad app on the Edge platforms', () => {
  const root = sampleApp('known-bad');

  it('reports only the subprocess on netlify-edge', async () => {
    const config = { targets: ['netlify-edge' as const], entry: 'src/index.js' };
    const [report] = (await check({ root, config })).reports;
    expect(report?.findings.map(finding => finding.api).sort()).toEqual([
      'node:child_process.spawn',
      'node:child_process.spawnSync',
    ]);
  });

  it('reports every module Vercel does not allow, including child_process', async () => {
    const config = { targets: ['vercel-edge' as const], entry: 'src/index.js' };
    const [report] = (await check({ root, config })).reports;
    const modules = new Set(report?.findings.map(finding => finding.api.replace(/\.[^.]*$/u, '')));
    expect([...modules].sort()).toEqual([
      'node:child_process',
      'node:fs',
      'node:fs/promises',
      'node:os',
      'node:path',
      'node:process',
      'node:stream',
    ]);
    // The two packages and the dependencies of theirs that reach fs, path and process.
    expect(new Set(report?.findings.map(finding => finding.package?.name))).toEqual(
      new Set(['chokidar', 'cross-spawn', 'isexe', 'path-key', 'readdirp', 'which']),
    );
    expect(report?.findings.every(finding => finding.level === 'error')).toBe(true);
  });

  it('shows the Edge platforms in the compare table when they are named', async () => {
    const io = captureIo(root);
    await run(['compare', 'workerd', 'netlify-edge', 'vercel-edge', '--entry', 'src/index.js', '--no-color'], io);
    expect(io.output()).toContain('API                           workerd  netlify-edge  vercel-edge');
    expect(io.output()).toContain('node:child_process.spawn      ✗        ✗             ✗');
    expect(io.output()).toContain('node:fs.watch                 ✗        ✓             –');
  });
});

/**
 * ajv compiles every schema with `new Function`, which Vercel's Edge runtime disables, so a
 * middleware that validates with it fails at runtime. Deno allows it.
 */
describe.skipIf(!installed)('a package that compiles code from strings', () => {
  const root = sampleApp('dynamic-code');

  it('reports new Function on vercel-edge, with what to do about it', async () => {
    const config = { targets: ['vercel-edge' as const], entry: 'src/index.js' };
    const [report] = (await check({ root, config })).reports;
    expect(report?.findings.map(finding => `${finding.api} ${finding.package?.name}`)).toEqual([
      'Function(string) ajv',
    ]);
    expect(report?.findings[0]?.suggestion?.text).toContain('unstable_allowDynamic');
  });

  it('finds nothing to report on netlify-edge', async () => {
    const config = { targets: ['netlify-edge' as const], entry: 'src/index.js' };
    expect((await check({ root, config })).reports[0]?.findings).toEqual([]);
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
    expect(report?.findings.map(finding => finding.suggestion?.setting)).toEqual(
      report?.findings.map(() => ({ name: 'compatibility_flags', value: 'nodejs_compat' })),
    );
    const packages = report?.findings.map(finding => finding.package?.name);
    expect(packages).toEqual(expect.arrayContaining(['pg', 'pg-protocol', 'pg-cloudflare']));
  });
});
