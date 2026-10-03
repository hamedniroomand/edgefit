import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { checkPackage } from '@/package/check-package.ts';
import { fixture } from '~/helpers.ts';

let tarballs: string;
const pack = (name: string): string => {
  const output = execFileSync(
    'npm',
    ['pack', fixture(`packages/${name}`), '--pack-destination', tarballs, '--json'],
    { encoding: 'utf8' },
  );
  const [packed] = JSON.parse(output) as { filename: string }[];
  return path.join(tarballs, packed?.filename ?? '');
};

beforeAll(() => {
  tarballs = mkdtempSync(path.join(tmpdir(), 'edgefit-tarballs-'));
});
afterAll(() => {
  rmSync(tarballs, { recursive: true, force: true });
});

describe('checkPackage', () => {
  it('checks an unscoped package through main', async () => {
    const result = await checkPackage(pack('plain'), { targets: ['workerd'] });
    expect(result.package).toBe('edgefit-fixture-plain');
    expect(result.resolved).toBe('1.2.3');
    expect(result.entries.map(entry => entry.subpath)).toEqual(['.']);
    expect(result.summary).toEqual({ workerd: 'pass' });
  });

  it('checks each exports subpath of a scoped package, with every export used', async () => {
    const result = await checkPackage(pack('scoped'), { targets: ['workerd', 'bun'] });
    expect(result.package).toBe('@edgefit-fixture/scoped');
    expect(result.entries.map(entry => entry.subpath)).toEqual(['.', './node']);
    expect(result.entries[0]?.results.workerd?.status).toBe('pass');
    expect(result.entries[1]?.results.workerd?.status).not.toBe('pass');
    // The main entry decides the result, and the worst subpath is named next to it.
    expect(result.summary.workerd).toBe('pass');
    expect(result.worst?.workerd?.subpath).toBe('./node');
    expect(result.summary.bun).toBeDefined();
  });

  it('checks a local directory as published', async () => {
    const result = await checkPackage(fixture('packages/plain'), { targets: ['workerd'] });
    expect(result.resolved).toBe('1.2.3');
  });

  it('removes the temporary project unless asked to keep it', async () => {
    let kept = '';
    await checkPackage(pack('plain'), {
      targets: ['workerd'],
      keep: true,
      onKeep: directory => {
        kept = directory;
      },
    });
    expect(existsSync(kept)).toBe(true);
    rmSync(kept, { recursive: true, force: true });
  });
});

describe.skipIf(process.env.EDGEFIT_REGISTRY_TESTS === undefined)('registry', () => {
  it('checks a package from the registry', async () => {
    const result = await checkPackage('jose@^5', { targets: ['workerd'] });
    expect(result.resolved).toMatch(/^5\./u);
  });
});
