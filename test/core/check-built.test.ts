import { cpSync, globSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { Finding } from '@/types.ts';
import { fixture } from '~/helpers.ts';

function summary(findings: readonly Finding[] | undefined): string[] {
  return (findings ?? []).map(
    finding =>
      `${finding.category} ${finding.api} ${finding.package?.name ?? '.'} ${finding.location.file}`,
  );
}

/** The Nitro fixture as it would be built without sourcemaps. */
function withoutSourcemaps(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-built-'));
  cpSync(fixture('nitro-app'), root, { recursive: true });
  for (const map of globSync('.output/**/*.map', { cwd: root })) {
    rmSync(path.join(root, map));
  }
  return root;
}

describe('check --built', () => {
  it('maps findings through sourcemaps to the original package', async () => {
    const result = await check({ root: fixture('nitro-app'), built: '.output/server' });
    const [report] = result.reports;
    expect(report?.entries).toEqual(['.output/server/index.mjs']);
    const locks = report?.findings.find(finding => finding.api === 'navigator.locks.request');
    expect(locks).toMatchObject({
      category: 'unsupported',
      package: { name: 'task-lock', version: '2.1.0' },
      location: { file: 'node_modules/task-lock/index.js', line: 2 },
      chain: [
        '.output/server/index.mjs',
        '.output/server/chunks/nitro/nitro.mjs',
        '.output/server/chunks/routes/index.mjs',
        'task-lock',
      ],
    });
    expect(report?.target.notes).toEqual([]);
  });

  it('reports the unenv polyfills the build bundled as mocked', async () => {
    const result = await check({ root: fixture('nitro-app'), built: '.output/server' });
    const mocked = result.reports[0]?.findings.filter(finding => finding.category === 'mocked');
    expect(summary(mocked)).toEqual([
      'mocked node:fs unenv node_modules/unenv/dist/runtime/node/internal/fs/fs.mjs',
      'mocked node:fs/promises unenv node_modules/unenv/dist/runtime/node/internal/fs/promises.mjs',
      'mocked node:process unenv node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs',
      'mocked node:tty unenv node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs',
    ]);
  });
});

describe('check --built without sourcemaps', () => {
  it('reports offsets in the output, with a note', async () => {
    const result = await check({ root: withoutSourcemaps(), built: '.output/server' });
    const [report] = result.reports;
    expect(summary(report?.findings)).toContain(
      'unsupported navigator.locks.request . .output/server/chunks/routes/index.mjs',
    );
    expect(report?.findings.some(finding => finding.category === 'mocked')).toBe(false);
    expect(report?.target.notes).toEqual([expect.stringContaining('sourcemap: true')]);
  });
});

describe('check --built entries', () => {
  it('accepts the entry file itself', async () => {
    const result = await check({ root: fixture('nitro-app'), built: '.output/server/index.mjs' });
    expect(result.reports[0]?.entries).toEqual(['.output/server/index.mjs']);
  });

  it('fails with a hint when the output has no entry', async () => {
    await expect(check({ root: fixture('nitro-app'), built: 'routes' })).rejects.toThrow(
      'No entry found in routes.',
    );
    await expect(check({ root: fixture('nitro-app'), built: '.output/missing' })).rejects.toThrow(
      'Built output not found',
    );
  });
});
