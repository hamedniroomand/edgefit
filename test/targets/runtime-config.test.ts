import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { readRuntimeSetting } from '@/targets/vercel/runtime-config.ts';

const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-runtime-'));
const setting = (name: string, source: string): string | undefined => {
  const file = path.join(directory, name);
  writeFileSync(file, source);
  return readRuntimeSetting(file);
};

describe('readRuntimeSetting', () => {
  it('reads config.runtime and a runtime export', () => {
    expect(setting('a.ts', "export const config = { runtime: 'nodejs' };")).toBe('nodejs');
    expect(setting('b.ts', "export const config = { matcher: '/x', runtime: 'edge' };")).toBe(
      'edge',
    );
    expect(setting('c.ts', "export const runtime = 'edge';")).toBe('edge');
    expect(setting('d.js', "export const config = { 'runtime': 'nodejs' };")).toBe('nodejs');
  });

  it('finds nothing when the file picks no runtime, or cannot be read', () => {
    expect(setting('e.ts', 'export default () => 1;')).toBeUndefined();
    expect(setting('f.ts', "export const config = { matcher: '/x' };")).toBeUndefined();
    expect(setting('g.ts', 'export const config = { runtime };')).toBeUndefined();
    expect(readRuntimeSetting(path.join(directory, 'missing.ts'))).toBeUndefined();
  });
});
