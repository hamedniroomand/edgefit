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

    it.each([
      'without-http2.mjs',
      'nested-http2.mjs',
      'through-wrapper.mjs',
      'destructured-http2.mjs',
    ])('stays hidden for got when %s does not set http2 in a file of the project', async entry => {
      const report = await run(entry);
      expect(report.findings).toEqual([]);
      expect(apis(report.guarded)).toEqual(['node:tls.connect']);
      expect(report.guarded[0]?.unreached).toBeDefined();
    });

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

/**
 * The Nitro fixture with its lock package renamed to the file of the HTTP/2 client of `got`, a call of
 * `tls.connect` in place of the lock call, and a chunk that sets `http2`.
 */
function builtWithHttp2Set(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-built-options-'));
  cpSync(fixture('nitro-app'), root, { recursive: true });
  const file = 'node_modules/got/dist/source/core/utils/http2-client.js';
  mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
  renameSync(path.join(root, 'node_modules/task-lock/index.js'), path.join(root, file));
  writeFileSync(
    path.join(root, 'node_modules/got/package.json'),
    '{ "name": "got", "version": "16.1.0" }\n',
  );
  const chunk = path.join(root, '.output/server/chunks/routes/index.mjs');
  const map = `${chunk}.map`;
  const sourcemap = JSON.parse(readFileSync(map, 'utf8')) as {
    sources: string[];
    mappings: string;
  };
  sourcemap.sources = sourcemap.sources.map(source =>
    source.endsWith('node_modules/task-lock/index.js') ? `../../../../${file}` : source,
  );
  // The import is a new first line, so the mappings start with an empty line.
  sourcemap.mappings = `;${sourcemap.mappings}`;
  writeFileSync(map, JSON.stringify(sourcemap));
  writeFileSync(
    chunk,
    `import tls from"node:tls";\n${readFileSync(chunk, 'utf8')
      .replace(
        'navigator.locks.request(a,c)',
        'tls.connect({host:a,port:443,ALPNProtocols:["h2"]})',
      )
      .replace(
        '//# sourceMappingURL',
        'export const settings={http2:true};\n//# sourceMappingURL',
      )}`,
  );
  return root;
}

describe('an entry that names an option, in build output', { timeout: packageFlowTimeout }, () => {
  it('applies although a file of the bundle sets the option, because the file may be from a package', async () => {
    const { reports } = await check({ root: builtWithHttp2Set(), built: '.output/server' });
    const [report] = reports;
    expect(apis(report?.findings ?? [])).not.toContain('node:tls.connect');
    const guarded = report?.guarded.find(finding => finding.api === 'node:tls.connect');
    expect(guarded).toMatchObject({ package: { name: 'got' }, category: 'mismatch' });
    expect(guarded?.unreached).toBeDefined();
  });
});

describe(
  'an entry of the unreached data that names an option path',
  { timeout: packageFlowTimeout },
  () => {
    it.each([
      ['with-auth-lock.mjs', 'navigator.locks.request'],
      ['wrapped-auth-lock.mjs', 'navigator.locks.request'],
      ['with-realtime-worker.mjs', 'Worker'],
    ])('is a finding when %s sets the option in an object literal', async (entry, api) => {
      const report = await run(entry);
      expect(apis(report.findings)).toContain(api);
      expect(report.guarded).toEqual([]);
    });

    it.each([
      ['without-auth-lock.mjs', 'navigator.locks.request'],
      ['destructured-auth-lock.mjs', 'navigator.locks.request'],
      ['without-realtime-worker.mjs', 'Worker'],
    ])('stays hidden when %s does not set the option', async (entry, api) => {
      const report = await run(entry);
      expect(report.findings).toEqual([]);
      expect(apis(report.guarded)).toContain(api);
      expect(report.guarded[0]?.unreached).toBeDefined();
    });
  },
);
