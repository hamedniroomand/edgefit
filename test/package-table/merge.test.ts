import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readVerify, verifiedOf, verifiedRow } from '@scripts/package-table/verify/fields.mjs';
import type { VerifyRun } from '@scripts/package-table/verify/fields.mjs';
import type { Cell } from '@scripts/package-table/verify/judge.mjs';
import { afterAll, describe, expect, it } from 'vite-plus/test';

const run = (runtime: string, cell: Cell, resolved = '5.0.0'): VerifyRun => ({
  package: 'chokidar',
  resolved,
  runtime,
  version: runtime === 'workerd' ? '1.20260929.1' : '1.4.2',
  cell,
});
const reach: Cell = {
  outcome: 'verified',
  kind: 'reach',
  api: 'node:fs.watch',
  error: 'ERR_UNSUPPORTED_OPERATION: The requested operation is unsupported',
};

describe('the verified field of a package result', () => {
  it('keeps a verified and a confirmed cell with the runtime and its version', () => {
    const confirmed: Cell = { outcome: 'confirmed', kind: 'load', error: 'ENOENT: no file' };
    expect(verifiedOf([run('workerd', reach), run('bun', confirmed)], '5.0.0')).toEqual({
      workerd: { ...reach, runtime: 'workerd 1.20260929.1' },
      bun: { outcome: 'confirmed', kind: 'load', runtime: 'bun 1.4.2', error: 'ENOENT: no file' },
    });
  });

  it('drops a mismatch, an absent cell and a run of another version', () => {
    const runs = [
      run('workerd', { outcome: 'mismatch', kind: 'reach' }),
      run('bun', { outcome: 'absent', kind: 'reach', reason: 'network' }),
      run('deno', { outcome: 'verified', kind: 'load' }, '4.0.0'),
    ];
    expect(verifiedOf(runs, '5.0.0')).toBeUndefined();
  });

  it('gives the row the outcomes alone', () => {
    const verified = verifiedOf(
      [run('workerd', reach), run('bun', { outcome: 'verified', kind: 'load' })],
      '5.0.0',
    );
    expect(verified === undefined ? undefined : verifiedRow(verified)).toEqual({
      workerd: 'verified',
      bun: 'verified',
    });
  });
});

describe('the output of the verify jobs', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-verify-'));
  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('is read by file, from one folder for each runtime', () => {
    for (const runtime of ['workerd', 'bun']) {
      mkdirSync(path.join(directory, `verify-${runtime}`));
      writeFileSync(
        path.join(directory, `verify-${runtime}`, 'chokidar.json'),
        JSON.stringify(run(runtime, reach)),
      );
    }
    writeFileSync(path.join(directory, 'verify-bun', 'notes.txt'), '');
    expect(
      readVerify(directory)
        .get('chokidar')
        ?.map(item => item.runtime)
        .toSorted(),
    ).toEqual(['bun', 'workerd']);
  });

  it('is empty when no job left an output', () => {
    expect(readVerify(path.join(directory, 'missing')).size).toBe(0);
    expect(readVerify().size).toBe(0);
  });
});
