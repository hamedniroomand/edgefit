import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';

/** The findings of one file on workerd, which has no `Deno` global. */
async function findingsOf(code: string): Promise<string[]> {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-helpers-'));
  writeFileSync(path.join(root, 'package.json'), '{"name":"helpers","type":"module"}');
  writeFileSync(path.join(root, 'index.mjs'), code);
  const { reports } = await check({
    root,
    config: { targets: ['workerd'], entry: 'index.mjs', workerd: { wranglerConfig: false } },
  });
  return (reports[0]?.findings ?? []).map(finding => finding.api);
}

const use = (call: string): string =>
  `export function f() { if (${call}) { return globalThis.Deno.env; } return undefined; }`;

describe('a helper that returns true or false after a test', () => {
  it.each([
    'function isDeno() { if ("Deno" in globalThis) { return true; } return false; }',
    'function isDeno() { if (!("Deno" in globalThis)) return false; return true; }',
    'function isDeno() { if ("Deno" in globalThis) return true; else return false; }',
    'const isDeno = () => { if ("Deno" in globalThis) { return true; } return false; };',
  ])('guards the code that it lets run: %s', async helper => {
    expect(await findingsOf(`${helper} ${use('isDeno()')}`)).toEqual([]);
  });

  it('reads `return false` after the test as the opposite check', async () => {
    const helper = 'function notDeno() { if ("Deno" in globalThis) return false; return true; }';
    expect(await findingsOf(`${helper} ${use('!notDeno()')}`)).toEqual([]);
    expect(await findingsOf(`${helper} ${use('notDeno()')}`)).toEqual(['Deno.env']);
  });

  it.each([
    'function isDeno() { if ("Deno" in globalThis) { return 1; } return 0; }',
    'function isDeno() { if ("Deno" in globalThis) { return true; } return true; }',
    'function isDeno() { if ("Deno" in globalThis) { return true; } f(); return false; }',
    'function isDeno() { if ("Deno" in globalThis) return true; else return false; f(); }',
    'function isDeno() { return; }',
    'function isDeno() { if ("Deno" in globalThis) return true; return; }',
  ])('is not followed when it does more or returns other values: %s', async helper => {
    expect(await findingsOf(`${helper} ${use('isDeno()')}`)).toEqual(['Deno.env']);
  });
});
