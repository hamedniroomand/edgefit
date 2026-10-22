import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetReport } from '@/core/check.ts';
import { fixture, packageFlowTimeout } from '~/helpers.ts';

async function run(entry: string): Promise<TargetReport> {
  const { reports } = await check({
    root: fixture('unreached-options-app'),
    config: { targets: ['workerd'], entry, workerd: { wranglerConfig: false } },
  });
  const [report] = reports;
  if (report === undefined) {
    throw new Error(`no report for ${entry}`);
  }
  return report;
}

const apis = (findings: TargetReport['findings']): string[] => findings.map(finding => finding.api);

describe(
  'an entry of the unreached data that names an option',
  { timeout: packageFlowTimeout },
  () => {
    it('is a finding for got when the project sets http2', async () => {
      const report = await run('with-http2.mjs');
      expect(report.findings).toMatchObject([
        { api: 'node:tls.connect', category: 'mismatch', level: 'warning' },
      ]);
      expect(report.guarded).toEqual([]);
    });

    it.each(['without-http2.mjs', 'nested-http2.mjs', 'through-wrapper.mjs'])(
      'stays hidden for got when %s sets no direct http2 property in a file of the project',
      async entry => {
        const report = await run(entry);
        expect(report.findings).toEqual([]);
        expect(apis(report.guarded)).toEqual(['node:tls.connect']);
        expect(report.guarded[0]?.unreached).toBeDefined();
      },
    );

    it('is a finding for nodemailer when the project sets sendmail', async () => {
      const report = await run('with-sendmail.mjs');
      expect(apis(report.findings)).toContain('node:child_process.spawn');
      expect(report.guarded).toEqual([]);
    });

    it('stays hidden for nodemailer when the project does not set sendmail', async () => {
      const report = await run('without-sendmail.mjs');
      expect(report.findings).toEqual([]);
      expect(apis(report.guarded)).toContain('node:child_process.spawn');
    });
  },
);

/** The Nitro fixture with its lock package renamed to the file of `@supabase/auth-js` that an entry lists, and a chunk that sets `lock`. */
function builtWithLockSet(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-built-options-'));
  cpSync(fixture('nitro-app'), root, { recursive: true });
  const original = path.join(root, 'node_modules/task-lock');
  const file = 'node_modules/@supabase/auth-js/dist/module/lib/locks.js';
  mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
  renameSync(path.join(original, 'index.js'), path.join(root, file));
  writeFileSync(
    path.join(root, 'node_modules/@supabase/auth-js/package.json'),
    '{ "name": "@supabase/auth-js", "version": "2.118.0" }\n',
  );
  const chunk = path.join(root, '.output/server/chunks/routes/index.mjs');
  const map = `${chunk}.map`;
  writeFileSync(map, readFileSync(map, 'utf8').replace('node_modules/task-lock/index.js', file));
  writeFileSync(
    chunk,
    readFileSync(chunk, 'utf8').replace(
      '//# sourceMappingURL',
      'export const settings={lock:1};\n//# sourceMappingURL',
    ),
  );
  return root;
}

describe('an entry that names an option, in build output', { timeout: packageFlowTimeout }, () => {
  it('applies although a file of the bundle sets the option, because the file may be from a package', async () => {
    const { reports } = await check({ root: builtWithLockSet(), built: '.output/server' });
    const [report] = reports;
    expect(apis(report?.findings ?? [])).not.toContain('navigator.locks.request');
    const guarded = report?.guarded.find(finding => finding.api === 'navigator.locks.request');
    expect(guarded).toMatchObject({ package: { name: '@supabase/auth-js' } });
    expect(guarded?.unreached).toBeDefined();
  });
});
