import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';

/** The findings and guarded findings of one file on workerd, which has no `Deno` global. */
async function resultsOf(code: string): Promise<{ findings: string[]; guarded: string[] }> {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-in-'));
  writeFileSync(path.join(root, 'package.json'), '{"name":"in-use","type":"module"}');
  writeFileSync(path.join(root, 'index.mjs'), code);
  const { reports } = await check({
    root,
    config: { targets: ['workerd'], entry: 'index.mjs', workerd: { wranglerConfig: false } },
  });
  return {
    findings: (reports[0]?.findings ?? []).map(finding => finding.api),
    guarded: (reports[0]?.guarded ?? []).map(finding => finding.api),
  };
}

describe('an in test on workerd', () => {
  it('reports a right side that the target lacks', async () => {
    expect((await resultsOf("export const a = 'k' in globalThis.Deno.env;")).findings).toEqual([
      'Deno.env',
    ]);
    expect((await resultsOf("export const a = 'k' in process.binding;")).findings).toEqual([
      'node:process.binding',
    ]);
  });

  it('reports nothing for a test of the global object', async () => {
    expect(await resultsOf("export const a = 'Deno' in globalThis;")).toEqual({
      findings: [],
      guarded: [],
    });
  });
});

describe('a module that the data does not cover, on workerd', () => {
  const v8 = "import v8 from 'node:v8';\n";

  it('keeps an unguarded read of a member when a member of it is guarded', async () => {
    const read = 'export const x = v8.startupSnapshot;\n';
    expect(
      await resultsOf(
        `${v8}${read}export const a = v8.startupSnapshot && 'z' in v8.startupSnapshot.k;`,
      ),
    ).toEqual({ findings: ['node:v8.startupSnapshot'], guarded: ['node:v8.startupSnapshot.k'] });
    expect(
      await resultsOf(
        `${v8}${read}export const b = typeof v8.startupSnapshot !== 'undefined' && v8.startupSnapshot.k;`,
      ),
    ).toEqual({ findings: ['node:v8.startupSnapshot'], guarded: ['node:v8.startupSnapshot.k'] });
  });

  it.each([v8, "const v8 = require('node:v8').default;\n"])(
    'still hides the module when its members are only used after a check: %s',
    async load => {
      expect(await resultsOf(`${load}if (v8.startupSnapshot) v8.startupSnapshot.k();`)).toEqual({
        findings: [],
        guarded: ['node:v8.startupSnapshot.k'],
      });
    },
  );
});
