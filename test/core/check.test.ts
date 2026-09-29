import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { EdgefitConfig, Finding } from '@/types.ts';
import { fixture } from '~/helpers.ts';

async function findingsFor(config: EdgefitConfig = {}): Promise<string[]> {
  const result = await check({ root: fixture('worker'), config });
  return (result.reports[0]?.findings ?? []).map(
    finding =>
      `${finding.level} ${finding.category} ${finding.api} ${finding.package?.name ?? '.'}`,
  );
}

describe('check', () => {
  it('finds unsupported APIs in dependencies with their import chain', async () => {
    const result = await check({ root: fixture('worker') });
    const [report] = result.reports;
    const watch = report?.findings.find(finding => finding.api === 'node:fs.watch');
    expect(watch).toMatchObject({
      level: 'error',
      category: 'unsupported',
      package: { name: 'chokidar', version: '4.0.1' },
      location: { file: 'node_modules/chokidar/index.js', line: 5 },
      chain: ['src/index.ts', 'src/dev/reload.ts', 'chokidar'],
    });
  });

  it('resolves packages with the target export conditions', async () => {
    const findings = await findingsFor();
    expect(findings.some(finding => finding.includes('child_process'))).toBe(false);
  });

  it('reports dynamic requires as unknown warnings', async () => {
    expect(await findingsFor()).toEqual([
      'error unsupported node:fs.watch chokidar',
      'warning unknown require(<expression>) pg-lite',
    ]);
  });

  it('applies ignore rules and level overrides', async () => {
    const findings = await findingsFor({
      ignore: [{ package: 'chokidar', reason: 'dev server only' }],
      levels: { unknown: 'off' },
    });
    expect(findings).toEqual([]);
  });

  it('reports modules as mocked for an older compatibility date', async () => {
    const findings = await findingsFor({ workerd: { compatibilityDate: '2025-01-01' } });
    expect(findings).toContain('error mocked node:fs.watch chokidar');
  });

  it('fails with a hint when there is no entry', async () => {
    const run = check({ root: fixture('worker'), config: { workerd: { wranglerConfig: false } } });
    await expect(run).rejects.toThrow('No entry point to scan.');
  });

  it('fails with a hint when the graph cannot be resolved', async () => {
    const run = check({ root: fixture('worker'), config: { entry: 'src/missing.ts' } });
    await expect(run).rejects.toThrow('Could not resolve the module graph');
  });
});

describe('check on bun', () => {
  it('scans only the bun build of a package with bun and node exports', async () => {
    const result = await check({
      root: fixture('bun-app'),
      config: { targets: ['bun'], entry: 'src/index.ts' },
    });
    const [report] = result.reports;
    expect(report?.findings.map(finding => `${finding.category} ${finding.api}`)).toEqual([
      'mocked node:async_hooks.createHook',
    ]);
    expect(report?.findings[0]?.location.file).toBe('node_modules/multi-runtime/bun.js');
  });
});

describe('check on deno', () => {
  const summary = (report: { findings: Finding[] } | undefined): string[] =>
    (report?.findings ?? []).map(
      finding =>
        `${finding.category} ${finding.api} ${finding.location.file}:${finding.location.line}:${finding.location.column}`,
    );

  it('resolves the import map, npm: specifiers and the deno export condition', async () => {
    const result = await check({
      root: fixture('deno-app'),
      config: { targets: ['deno'], entry: 'src/main.ts' },
    });
    expect(summary(result.reports[0])).toEqual([
      'unsupported node:util.isString src/lib/describe.ts:1:10',
      'unsupported node:cluster.fork node_modules/cluster-pool/index.js:3:32',
      'unsupported node:v8.takeCoverage node_modules/multi-runtime/deno.js:1:10',
      'unknown jsr:@std/path@^1.0.0 src/main.ts:1:23',
    ]);
    expect(result.reports[0]?.findings[3]?.detail).toContain('jsr: packages are not scanned yet');
  });

  it('checks deno-deploy with the same resolution', async () => {
    const result = await check({
      root: fixture('deno-app'),
      config: { targets: ['deno', 'deno-deploy'], entry: 'src/main.ts' },
    });
    const [deno, deploy] = result.reports;
    expect(deploy?.target.key).toBe('deno-deploy');
    expect(summary(deploy)).toEqual(summary(deno));
  });
});

describe('check with includeSupported', () => {
  it('lists reached APIs the target supports only when asked', async () => {
    const config: EdgefitConfig = { targets: ['bun'], entry: 'src/index.ts' };
    const plain = await check({ root: fixture('compare-app'), config });
    expect(plain.reports[0]?.supported).toEqual([]);
    const full = await check({ root: fixture('compare-app'), config, includeSupported: true });
    expect(full.reports[0]?.supported.map(entry => entry.api)).toEqual([
      'node:fs',
      'node:fs.readFile',
      'node:fs.watch',
    ]);
  });
});

describe('check on Web APIs', () => {
  async function findingsOn(targets: EdgefitConfig['targets']): Promise<string[][]> {
    const result = await check({
      root: fixture('web-app'),
      config: { targets, entry: 'src/index.ts' },
    });
    return result.reports.map(report =>
      report.findings.map(finding => `${finding.level} ${finding.category} ${finding.api}`),
    );
  }

  it('reports Web API data as warnings where the matrix has no data', async () => {
    const [workerd, bun, deno] = await findingsOn(['workerd', 'bun', 'deno']);
    // The matrix describes BroadcastChannel and navigator.locks, so its errors stand.
    expect(workerd).toEqual([
      'error unsupported BroadcastChannel',
      'error unsupported navigator.locks.request',
      'warning web FileReader',
    ]);
    expect(bun).toEqual([
      'error unsupported navigator.locks.request',
      'warning web caches.open',
      'warning web FileReader',
    ]);
    // Deno has had Web Locks since 2.9, so it reports nothing here.
    expect(deno).toEqual([]);
  });

  it('treats a feature check as a check, not a use', async () => {
    const [bun] = await findingsOn(['bun']);
    expect(bun?.some(finding => finding.includes('navigator.gpu'))).toBe(false);
  });

  it('lets the web level be raised', async () => {
    const result = await check({
      root: fixture('web-app'),
      config: { targets: ['workerd'], entry: 'src/index.ts', levels: { web: 'error' } },
    });
    const fileReader = result.reports[0]?.findings.find(finding => finding.api === 'FileReader');
    expect(fileReader?.level).toBe('error');
  });
});

describe('check with guarded code', () => {
  const describeAll = (findings: Finding[] | undefined): string[] =>
    (findings ?? []).map(finding => `${finding.api} ${finding.location.file}`);

  it('hides code that checks for an API the target lacks', async () => {
    const [report] = (await check({ root: fixture('guarded-app') })).reports;
    expect(describeAll(report?.guarded)).toEqual(['crypto.subtle.getPublicKey src/index.js']);
    expect(report?.guarded[0]?.guarded).toBe(true);
  });

  it('keeps an API that exists and throws, even behind a check', async () => {
    const [report] = (await check({ root: fixture('guarded-app') })).reports;
    expect(describeAll(report?.findings)).toEqual([
      'node:fs.watch src/always.js',
      'node:fs.watch src/index.js',
    ]);
  });
});
