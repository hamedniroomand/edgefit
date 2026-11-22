import { readFileSync } from 'node:fs';

import { judge, matchOf } from '@scripts/package-table/verify/judge.mjs';
import type { RowFinding, Run, RunError } from '@scripts/package-table/verify/judge.mjs';
import { describe, expect, it } from 'vite-plus/test';

import { fixture } from '~/helpers.ts';

/** Real runs on workerd 1.20260929.1 and the findings of the same rows. */
const runs = JSON.parse(readFileSync(fixture('verify/workerd-runs.json'), 'utf8')) as Record<
  string,
  { findings: RowFinding[]; run: Run }
>;
const row = (name: string): { findings: RowFinding[]; run: Run } => {
  const found = runs[name];
  if (found === undefined) {
    throw new Error(`no fixture for ${name}`);
  }
  return found;
};
const error = (fields: Partial<RunError>): RunError => ({ ok: false, ...fields });

describe('a fail row on workerd, with the errors of real runs', () => {
  it('verifies chokidar: the reach script throws the fs.watch finding', () => {
    expect(judge({ status: 'fail', ...row('chokidar') })).toEqual({
      outcome: 'verified',
      kind: 'reach',
      api: 'node:fs.watch',
      error:
        'ERR_UNSUPPORTED_OPERATION: The requested operation is unsupported, at watch (node-internal:internal_fs_callback:939:11)',
    });
  });

  it('verifies bcrypt by the load and the native addon rule', () => {
    const cell = judge({ status: 'fail', ...row('bcrypt') });
    expect(cell).toMatchObject({ outcome: 'verified', kind: 'load', api: 'native addon bcrypt' });
  });

  it('confirms undici: the cause of fetch failed is a tls error, not a finding', () => {
    expect(judge({ status: 'fail', ...row('undici') })).toEqual({
      outcome: 'confirmed',
      kind: 'reach',
      error:
        'ERR_OPTION_NOT_IMPLEMENTED: The options.ALPNProtocols option is not implemented, at new TLSSocket (node-internal:internal_tls_wrap:86:15)',
    });
  });

  it('confirms jsdom: the load fails on its own stylesheet before a finding', () => {
    const cell = judge({ status: 'fail', ...row('jsdom') });
    expect(cell.outcome).toBe('confirmed');
    expect(cell.error).toContain(
      "ENOENT: no such file or directory, readAll '/browser/default-stylesheet.css'",
    );
  });
});

describe('a finding that only some exports reach', () => {
  it('confirms undici, but does not verify it, when MockAgent throws its Console finding', () => {
    const console = error({
      name: 'Error',
      code: 'ERR_METHOD_NOT_IMPLEMENTED',
      message: 'The Console method is not implemented',
      stack: [
        'Error: The Console method is not implemented',
        '    at new Console (node:console:22:11)',
      ],
    });
    const cell = judge({
      status: 'fail',
      run: { load: { ok: true }, reach: console },
      findings: row('undici').findings,
    });
    expect(cell).toEqual({
      outcome: 'confirmed',
      kind: 'reach',
      error:
        'reproduced a finding of export MockAgent, SnapshotAgent, not the finding that fails the row: ERR_METHOD_NOT_IMPLEMENTED: The Console method is not implemented, at new Console (node:console:22:11)',
    });
  });
});

describe('the match rule', () => {
  const watch: RowFinding = {
    api: 'node:fs.watch',
    category: 'unsupported',
    level: 'error',
    detail: 'throws ERR_UNSUPPORTED_OPERATION',
  };

  it('needs the code that the detail names', () => {
    const thrown = error({ code: 'ERR_OTHER', message: 'boom', stack: ['    at watch (x)'] });
    expect(matchOf(thrown, [watch])).toBeUndefined();
  });

  it('needs the member of the API in the message or the stack, as a word', () => {
    const coded = { code: 'ERR_UNSUPPORTED_OPERATION', message: 'unsupported' };
    expect(matchOf(error({ ...coded, stack: ['    at watcher (x)'] }), [watch])).toBeUndefined();
    expect(matchOf(error({ ...coded, stack: ['    at watch (x)'] }), [watch])).toBeDefined();
  });

  it('takes the member alone when the detail names no code', () => {
    const plain = { ...watch, detail: 'is not implemented' };
    expect(matchOf(error({ message: 'fs.watch is not implemented' }), [plain])).toBeDefined();
  });

  it('ignores a warning finding', () => {
    const warning = { ...watch, level: 'warning' as const };
    const thrown = error({ code: 'ERR_UNSUPPORTED_OPERATION', message: 'watch' });
    expect(matchOf(thrown, [warning])).toBeUndefined();
  });

  it('tests every error in the cause chain', () => {
    const inner = error({ code: 'ERR_UNSUPPORTED_OPERATION', message: 'watch failed' });
    const found = matchOf(error({ message: 'outer', cause: inner }), [watch]);
    expect(found?.error).toBe(inner);
  });

  it.each([
    'Could not locate the bindings file',
    'Could not find module root given file: "bundle.mjs"',
    'Error loading shared library x.node',
    'process.dlopen is not supported',
  ])('matches a native addon finding on "%s"', message => {
    const addon = { ...watch, api: 'native addon x', detail: 'is a native addon' };
    expect(matchOf(error({ message }), [addon])).toBeDefined();
  });
});
