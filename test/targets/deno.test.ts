import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { createDenoTarget } from '@/targets/deno/index.ts';
import { fixture } from '~/helpers.ts';

const emptyProject = mkdtempSync(path.join(tmpdir(), 'edgefit-deno-'));

describe('deno lookups', () => {
  const target = createDenoTarget(emptyProject);

  it('reports an API missing from Deno as unsupported', () => {
    expect(target.lookup({ module: 'util', path: ['isString'] })).toEqual({
      status: 'unsupported',
      note: 'does not exist on the target',
      absent: true,
    });
  });

  it('reports a curated stub with its Deno source', () => {
    expect(target.lookup({ module: 'v8', path: ['takeCoverage'] })).toEqual({
      status: 'unsupported',
      note: 'throws Not implemented',
      source: 'https://github.com/denoland/deno/tree/v2.9.7/ext/node/polyfills/v8.ts',
    });
    expect(target.lookup({ module: 'process', path: ['setSourceMapsEnabled'] }).status).toBe(
      'mocked',
    );
  });

  it('treats implemented modules the matrix does not cover as supported', () => {
    expect(target.lookup({ module: 'child_process', path: ['spawn'] }).status).toBe('supported');
    expect(target.lookup({ module: 'worker_threads', path: ['isInternalThread'] }).status).toBe(
      'supported',
    );
    expect(target.lookup({ module: 'v8', path: ['isStringOneByteRepresentation'] }).status).toBe(
      'unsupported',
    );
  });

  it('keeps working members of a stubbed module', () => {
    expect(target.lookup({ module: 'cluster', path: ['isPrimary'] }).status).toBe('supported');
    expect(target.lookup({ module: 'cluster', path: ['fork'] }).status).toBe('unsupported');
  });
});

describe('deno target info', () => {
  it('names the matrix commit, the Deno version and the import map', () => {
    const { info } = createDenoTarget(fixture('deno-app'));
    expect(info.key).toBe('deno');
    expect(info.data).toBe(
      'workers-nodejs-compat-matrix@ee58120 (deno 2.9.7), curated overrides from ' +
        'https://github.com/denoland/deno/tree/v2.9.7/ext/node/polyfills, ' +
        'Web APIs from runtime-compat-data@b964f92 (npm 0.0.5)',
    );
    expect(info.conditions).toEqual(['deno', 'node']);
    expect(info.settings).toBe('Deno 2.9.7, import map from deno.jsonc');
    expect(info.notes).toEqual([]);
  });

  it('says when there is no import map', () => {
    expect(createDenoTarget(emptyProject).info.settings).toBe(
      'Deno 2.9.7, no import map (no deno.json found)',
    );
    expect(createDenoTarget(fixture('deno-app'), { configFile: false }).info.settings).toBe(
      'Deno 2.9.7, no import map (no deno.json found)',
    );
  });

  it('shows the Deno Deploy layer and the older Deno it runs', () => {
    const { info } = createDenoTarget(fixture('deno-app'), { deploy: true });
    expect(info.key).toBe('deno-deploy');
    expect(info.platform).toBe('Deno Deploy');
    expect(info.data).toContain('and https://github.com/denoland/docs/tree/');
    expect(info.settings).toBe('Deno Deploy on Deno 2.5.0, import map from deno.jsonc');
    expect(info.notes).toEqual([
      'Deno 2.5.0 is older than the data (2.9.7); APIs added to Deno since then are reported as supported.',
    ]);
  });
});

describe('deno workspace settings', () => {
  it('names the workspace root as the source of an inherited import map', () => {
    const target = createDenoTarget(fixture('deno-workspace/packages/core'));
    expect(target.info.settings).toContain(
      'import map from deno.json and ../../deno.json (workspace root)',
    );
  });
});
