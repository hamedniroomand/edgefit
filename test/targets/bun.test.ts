import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { createBunTarget } from '@/targets/bun/index.ts';
import { findPinnedVersion } from '@/targets/bun/version.ts';
import { compareVersions } from '@/targets/runtime-version.ts';
import { fixture } from '~/helpers.ts';

function projectWith(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-bun-'));
  for (const [file, contents] of Object.entries(files)) {
    writeFileSync(path.join(root, file), contents);
  }
  return root;
}

describe('bun lookups', () => {
  const target = createBunTarget(projectWith({}));

  it('reports an API missing from Bun as unsupported', () => {
    expect(target.lookup({ module: 'util', path: ['getCallSites'] })).toEqual({
      status: 'unsupported',
      note: 'does not exist on the target',
      absent: true,
    });
  });

  it('reports a curated stub with its Bun source', () => {
    expect(target.lookup({ module: 'v8', path: ['setFlagsFromString'] })).toEqual({
      status: 'unsupported',
      note: 'throws a NotImplementedError',
      source: 'https://github.com/oven-sh/bun/tree/bun-v1.3.13/src/js/node/v8.ts',
    });
    expect(target.lookup({ module: 'async_hooks', path: ['createHook'] }).status).toBe('mocked');
  });

  it('reports a mismatch in shape', () => {
    expect(target.lookup({ module: 'buffer', path: ['transcode'] })).toEqual({
      status: 'mismatch',
      note: 'is a undefined on the target but a function in Node',
    });
  });

  it('treats value differences such as process.versions as supported', () => {
    expect(target.lookup({ module: 'process', path: ['versions', 'acorn'] }).status).toBe(
      'supported',
    );
    expect(target.hasProblemsBelow({ module: 'process', path: ['config'] })).toBe(false);
  });

  it('keeps working members of a stubbed module', () => {
    expect(target.lookup({ module: 'repl', path: ['builtinModules'] }).status).toBe('supported');
    expect(target.lookup({ module: 'repl', path: ['start'] }).status).toBe('unsupported');
  });
});

describe('bun target info', () => {
  it('names the matrix commit and Bun version', () => {
    const { info } = createBunTarget(projectWith({}));
    expect(info.data).toContain('workers-nodejs-compat-matrix@ee58120 (bun 1.3.13)');
    expect(info.data).toContain('https://github.com/oven-sh/bun/tree/bun-v1.3.13');
    expect(info.conditions).toEqual(['bun', 'node']);
    expect(info.settings).toBe(
      'Bun 1.3.13 (from the compatibility data; no pinned Bun version found)',
    );
    expect(info.notes).toEqual([]);
  });

  it('notes a pinned Bun version older than the data', () => {
    const { info } = createBunTarget(fixture('bun-app'));
    expect(info.settings).toBe('Bun 1.2.0 (from package.json packageManager)');
    expect(info.notes).toEqual([
      'Bun 1.2.0 is older than the data (1.3.13); APIs added to Bun since then are reported as supported.',
    ]);
  });

  it('lets the config version win over the pinned one', () => {
    const { info } = createBunTarget(fixture('bun-app'), { version: '1.3.13' });
    expect(info.settings).toBe('Bun 1.3.13 (from the edgefit config)');
    expect(info.notes).toEqual([]);
  });
});

describe('pinned Bun versions', () => {
  it('reads packageManager before .bun-version', () => {
    const root = projectWith({
      'package.json': JSON.stringify({ packageManager: 'bun@1.1.8+sha512.abc' }),
      '.bun-version': '1.0.0\n',
    });
    expect(findPinnedVersion(root)).toEqual({
      version: '1.1.8',
      origin: 'package.json packageManager',
    });
  });

  it('reads .bun-version when packageManager names another manager', () => {
    const root = projectWith({
      'package.json': JSON.stringify({ packageManager: 'pnpm@10.0.0' }),
      '.bun-version': 'bun-v1.2.3\n',
    });
    expect(findPinnedVersion(root)).toEqual({ version: '1.2.3', origin: '.bun-version' });
  });

  it('returns nothing without a pin', () => {
    expect(findPinnedVersion(projectWith({}))).toBeUndefined();
  });

  it('compares versions numerically', () => {
    expect(compareVersions('1.2.10', '1.2.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.3.13')).toBeLessThan(0);
    expect(compareVersions('latest', '1.3.13')).toBe(0);
  });
});
