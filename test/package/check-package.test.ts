import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { checkPackage } from '@/package/check-package.ts';
import { fixture, packageFlowTimeout } from '~/helpers.ts';

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

describe('checkPackage', { timeout: packageFlowTimeout }, () => {
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
    // The error sits behind the export watchIt, so it is listed under it and does not set the status.
    expect(result.entries[1]?.results.workerd).toMatchObject({
      status: 'pass',
      errors: 0,
      exports: [{ name: 'watchIt', level: 'error' }],
    });
    expect(result.summary.workerd).toBe('pass');
    expect(result.worstExport?.workerd).toMatchObject({
      subpath: './node',
      name: 'watchIt',
      status: 'fail',
    });
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

describe(
  'checkPackage with a subpath that is not a script',
  { timeout: packageFlowTimeout },
  () => {
    it('skips a subpath that is a sourcemap, and lists it as skipped', async () => {
      const result = await checkPackage(pack('map-export'), { targets: ['workerd'] });
      expect(result.entries.map(entry => entry.subpath)).toEqual(['.']);
      expect(result.skipped).toEqual([
        {
          subpath: './dist/index.js.map',
          reason: 'no target of this subpath is a script file (.map)',
        },
      ]);
      expect(result.entries.flatMap(entry => Object.values(entry.results))).not.toContainEqual(
        expect.objectContaining({ status: 'error' }),
      );
      expect(result.summary).toEqual({ workerd: 'pass' });
    });

    it('says why when the only subpath to check is skipped', async () => {
      const failure = checkPackage(pack('map-export'), {
        targets: ['workerd'],
        subpaths: ['./dist/index.js.map'],
      });
      await expect(failure).rejects.toThrow('has no public entry point to check');
      await expect(failure).rejects.toMatchObject({
        hint: 'Skipped ./dist/index.js.map: no target of this subpath is a script file (.map).',
      });
    });

    it('leaves skipped out of the result when nothing is skipped', async () => {
      const result = await checkPackage(pack('plain'), { targets: ['workerd'] });
      expect(result).not.toHaveProperty('skipped');
    });
  },
);

describe(
  'checkPackage with a target whose graph does not resolve',
  { timeout: packageFlowTimeout },
  () => {
    it('is not checked on that target only, and has a result on the others', async () => {
      const result = await checkPackage(fixture('packages/browser-missing'), {
        targets: ['workerd', 'bun', 'deno'],
      });
      const row = result.entries[0]?.results;
      expect(row?.workerd?.status).toBe('unchecked');
      expect(row?.workerd?.message).toContain('edgefit-missing-wasm');
      expect(row?.bun?.status).toBe('pass');
      expect(row?.deno?.status).toBe('pass');
    }, 60_000);
  },
);

describe('checkPackage with a main subpath', { timeout: packageFlowTimeout }, () => {
  it('takes the result from the subpath that the caller names as the main entry', async () => {
    const result = await checkPackage(pack('scoped'), { targets: ['workerd'], main: './node' });
    expect(result.main).toBe('./node');
    expect(result.summary.workerd).toBe(result.entries[1]?.results.workerd?.status);
    expect(result.worst).toBeUndefined();
  });

  it('leaves main out when no subpath is named, and rejects one that is not an entry', async () => {
    const plain = await checkPackage(pack('plain'), { targets: ['workerd'] });
    expect(plain.main).toBeUndefined();
    await expect(
      checkPackage(pack('plain'), { targets: ['workerd'], main: './missing' }),
    ).rejects.toThrow('has no checked entry ./missing');
  });
});

describe.skipIf(process.env.EDGEFIT_REGISTRY_TESTS === undefined)('registry', () => {
  it('checks a package from the registry', async () => {
    const result = await checkPackage('jose@^5', { targets: ['workerd'] });
    expect(result.resolved).toMatch(/^5\./u);
  });
});
