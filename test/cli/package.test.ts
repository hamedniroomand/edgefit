import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vite-plus/test';

import { parsePackageArgs } from '@/cli/args.ts';
import { run } from '@/cli/run.ts';
import { EdgefitError } from '@/errors.ts';
import { captureIo, fixture } from '~/helpers.ts';

const scratch = mkdtempSync(path.join(tmpdir(), 'edgefit-cli-package-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('parsePackageArgs', () => {
  it('reads the spec and flags', () => {
    expect(
      parsePackageArgs([
        '@s/p@1',
        '--target',
        'bun',
        '--export',
        './a',
        '--export',
        './b',
        '--keep',
      ]),
    ).toMatchObject({
      spec: { kind: 'registry', name: '@s/p', selector: '1' },
      targets: ['bun'],
      exports: ['./a', './b'],
      keep: true,
    });
  });

  it('reads the subpath that decides the result', () => {
    expect(parsePackageArgs(['firebase', '--main', './app'])).toMatchObject({ main: './app' });
    expect(parsePackageArgs(['firebase']).main).toBeUndefined();
  });

  it('needs exactly one package', () => {
    expect(() => parsePackageArgs([])).toThrow(EdgefitError);
    expect(() => parsePackageArgs(['a', 'b'])).toThrow(EdgefitError);
  });

  it('rejects the github format', () => {
    expect(() => parsePackageArgs(['a', '--format', 'github'])).toThrow(EdgefitError);
  });
});

describe('edgefit package', () => {
  it('prints the grid and writes a badge', async () => {
    const io = captureIo(scratch);
    const badge = path.join(scratch, 'badge.svg');
    const code = await run(
      ['package', fixture('packages/plain'), '--target', 'workerd', '--badge', badge],
      io,
    );
    expect(code).toBe(0);
    expect(io.output()).toContain('edgefit-fixture-plain@1.2.3');
    expect(io.output()).toContain('✓');
    expect(io.output()).toContain('guide/packages');
    expect(readFileSync(badge, 'utf8')).toContain('workerd ✓');
  });

  it('prints JSON and exits 1 on a failure', async () => {
    const tarball = execFileSync(
      'npm',
      ['pack', fixture('packages/scoped'), '--pack-destination', scratch, '--json'],
      { encoding: 'utf8' },
    );
    const [packed] = JSON.parse(tarball) as { filename: string }[];
    const io = captureIo(scratch);
    const code = await run(
      [
        'package',
        path.join(scratch, packed?.filename ?? ''),
        '--target',
        'workerd',
        '--format',
        'json',
      ],
      io,
    );
    const report = JSON.parse(io.output()) as { package: string; summary: Record<string, string> };
    expect(report.package).toBe('@edgefit-fixture/scoped');
    expect(code).toBe(report.summary.workerd === 'fail' ? 1 : 0);
  });
});
