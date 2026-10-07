import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { entrySource, marker, resultOf } from '@scripts/package-table/verify/entry.mjs';
import { afterAll, describe, expect, it } from 'vite-plus/test';

const work = mkdtempSync(path.join(tmpdir(), 'edgefit-entry-'));
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

/** Writes a fake package and an entry for it, runs the entry on Node, and reads its result. */
function runOnNode(name: string, main: string, reach?: string): unknown {
  const directory = path.join(work, name);
  mkdirSync(path.join(directory, 'node_modules', name), { recursive: true });
  writeFileSync(path.join(directory, 'node_modules', name, 'index.mjs'), main);
  writeFileSync(
    path.join(directory, 'node_modules', name, 'package.json'),
    JSON.stringify({ name, type: 'module', exports: './index.mjs' }),
  );
  if (reach !== undefined) {
    writeFileSync(path.join(directory, 'reach.mjs'), reach);
  }
  const source = entrySource({ specifier: name, reach: reach !== undefined, host: 'script' });
  writeFileSync(path.join(directory, 'entry.mjs'), source);
  const run = spawnSync(process.execPath, ['entry.mjs'], { cwd: directory, encoding: 'utf8' });
  return resultOf(run.stdout);
}

describe('the entry of a load run', () => {
  it('gives ok when the package loads, and skips what the package prints', () => {
    expect(runOnNode('loads', "console.log('hello');\nexport const a = 1;")).toEqual({
      load: { ok: true },
    });
  });

  it('gives the error, its code and its cause when the import throws', () => {
    const main =
      "const error = new Error('outer', { cause: Object.assign(new Error('inner'), { code: 'ERR_X' }) });\nthrow error;";
    expect(runOnNode('throws', main)).toMatchObject({
      load: {
        ok: false,
        name: 'Error',
        message: 'outer',
        cause: { code: 'ERR_X', message: 'inner' },
      },
    });
  });
});

describe('the entry of a reach run', () => {
  it('runs the reach script after the load and gives its error', () => {
    const reach = "export async function run() {\n  throw new RangeError('reached');\n}";
    expect(runOnNode('reaches', 'export const a = 1;', reach)).toMatchObject({
      load: { ok: true },
      reach: { ok: false, name: 'RangeError', message: 'reached' },
    });
  });

  it('gives ok when the reach script finishes', () => {
    const reach = 'export async function run() {}';
    expect(runOnNode('finishes', 'export const a = 1;', reach)).toEqual({
      load: { ok: true },
      reach: { ok: true },
    });
  });
});

describe('the entry for workerd', () => {
  it('loads the package while the Worker starts, and runs the reach in fetch', () => {
    const source = entrySource({ specifier: 'pkg', reach: true, host: 'worker' });
    const handler = source.indexOf('export default');
    expect(source.indexOf('const loaded = await load();')).toBeGreaterThan(-1);
    expect(source.indexOf('const loaded = await load();')).toBeLessThan(handler);
    expect(source.slice(handler)).toContain('Response.json(await finish(loaded))');
    expect(source.slice(handler)).not.toContain('load()');
    expect(source).not.toContain(marker);
  });

  it('gives no result for output without the marker', () => {
    expect(resultOf('hello\n')).toBeUndefined();
  });
});
