import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { setup } from '~/temp-root.ts';

const names = ['TMPDIR', 'TEMP', 'TMP'];
const saved = names.map(name => process.env[name]);
const roots: string[] = [];

function restore(): void {
  for (const [index, name] of names.entries()) {
    const value = saved[index];
    if (value === undefined) {
      Reflect.deleteProperty(process.env, name);
    } else {
      process.env[name] = value;
    }
  }
}

/** Runs setup with a known env: TMPDIR set, TEMP empty, TMP missing. */
function setupWithKnownEnv(): { root: string; teardown: () => void } {
  const base = saved[0] ?? process.env.TEMP ?? '/tmp';
  process.env.TMPDIR = base;
  process.env.TEMP = '';
  Reflect.deleteProperty(process.env, 'TMP');
  const teardown = setup();
  const root = process.env.TMPDIR;
  roots.push(root);
  return { root, teardown };
}

afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  restore();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('the temp root of a test run', () => {
  it('points the temp env at a new root, then puts the env back and deletes the root', () => {
    const base = saved[0] ?? process.env.TEMP ?? '/tmp';
    const { root, teardown } = setupWithKnownEnv();
    expect(path.basename(root)).toMatch(/^edgefit-test-/u);
    expect([process.env.TEMP, process.env.TMP]).toEqual([root, root]);
    expect(fs.existsSync(root)).toBe(true);
    teardown();
    expect(process.env.TMPDIR).toBe(base);
    expect(process.env.TEMP).toBe('');
    expect('TMP' in process.env).toBe(false);
    expect(fs.existsSync(root)).toBe(false);
  });

  it('warns and still puts the env back when the root cannot be deleted', () => {
    const base = saved[0] ?? process.env.TEMP ?? '/tmp';
    const { root, teardown } = setupWithKnownEnv();
    // An ESM export of node:fs cannot be spied on. Node copies a change of the CommonJS object
    // into the ESM exports when syncBuiltinESMExports() runs.
    vi.spyOn(fs, 'rmSync').mockImplementation(() => {
      throw new Error('EBUSY: resource busy');
    });
    syncBuiltinESMExports();
    const warning = vi.spyOn(process, 'emitWarning').mockReturnValue();
    teardown();
    expect(warning).toHaveBeenCalledWith('Cannot delete a temp folder: EBUSY: resource busy');
    expect(process.env.TMPDIR).toBe(base);
    expect('TMP' in process.env).toBe(false);
    expect(fs.existsSync(root)).toBe(true);
  });
});
