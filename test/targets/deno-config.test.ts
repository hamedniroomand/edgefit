import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import { findDenoConfig, readDenoConfig, readImportMapFile } from '@/targets/deno/deno-config.ts';

let root = '';

function write(name: string, content: string): string {
  const file = path.join(root, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function setup(): void {
  root = mkdtempSync(path.join(tmpdir(), 'edgefit-deno-config-'));
}

describe('deno config', () => {
  it('finds deno.json and deno.jsonc', () => {
    setup();
    expect(findDenoConfig(root)).toBeUndefined();
    const file = write('deno.jsonc', '{}');
    expect(findDenoConfig(root)).toBe(file);
  });

  it('reads string imports and ignores the rest', () => {
    setup();
    const file = write('deno.json', '{ "imports": { "a": "./a.ts", "b": 1 } }');
    expect(readDenoConfig(file).importMap).toEqual({ imports: { a: './a.ts' }, directory: root });
  });

  it('reads the import map file that importMap points to', () => {
    setup();
    const file = write('deno.json', '{ "importMap": "./maps/map.json" }');
    write('maps/map.json', '{ "imports": { "a": "./a.ts" } }');
    expect(readDenoConfig(file).importMap).toEqual({
      imports: { a: './a.ts' },
      directory: path.join(root, 'maps'),
    });
  });

  it('returns no import map without imports', () => {
    setup();
    expect(readDenoConfig(write('deno.json', '{}')).importMap).toBeUndefined();
    expect(readDenoConfig(write('deno.json', '[]')).importMap).toBeUndefined();
    write('map.json', '{}');
    const file = write('deno.json', '{ "importMap": "./map.json" }');
    expect(readDenoConfig(file).importMap).toBeUndefined();
    expect(readImportMapFile(path.join(root, 'map.json'))).toBeUndefined();
  });
});
