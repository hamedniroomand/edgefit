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

describe('deno workspace', () => {
  it('inherits the workspace root import map and lets the member override it', () => {
    setup();
    write(
      'deno.json',
      '{ "workspace": ["./app"], "imports": { "a": "./a.ts", "b": "./b.ts", "~/": "./src/" } }',
    );
    const file = write('app/deno.json', '{ "imports": { "b": "./own-b.ts" } }');
    expect(readDenoConfig(file).importMap).toEqual({
      imports: {
        a: path.join(root, 'a.ts'),
        b: './own-b.ts',
        '~/': `${path.join(root, 'src')}/`,
      },
      directory: path.join(root, 'app'),
    });
  });

  it('uses the root import map when the member has none', () => {
    setup();
    write('deno.json', '{ "workspace": ["./app"], "imports": { "a": "jsr:@x/a@1" } }');
    const file = write('app/deno.json', '{}');
    expect(readDenoConfig(file).importMap).toEqual({
      imports: { a: 'jsr:@x/a@1' },
      directory: root,
    });
  });

  it('reads the object form of workspace', () => {
    setup();
    write(
      'deno.json',
      '{ "workspace": { "members": ["./app"] }, "imports": { "a": "jsr:@x/a@1" } }',
    );
    const file = write('app/deno.json', '{}');
    expect(readDenoConfig(file).importMap?.imports).toEqual({ a: 'jsr:@x/a@1' });
  });
});

describe('deno workspace root', () => {
  it('names the files that the import map comes from', () => {
    setup();
    const rootFile = write(
      'deno.json',
      '{ "workspace": ["./app", "./bare"], "imports": { "a": "./a.ts" } }',
    );
    const app = write('app/deno.json', '{ "imports": { "b": "./b.ts" } }');
    const bare = write('bare/deno.json', '{}');
    expect(readDenoConfig(app).importMapFiles).toEqual([app, rootFile]);
    expect(readDenoConfig(bare).importMapFiles).toEqual([rootFile]);
    expect(readDenoConfig(rootFile).importMapFiles).toEqual([rootFile]);
  });

  it('reads only the nearest parent config', () => {
    setup();
    write('deno.json', '{ not json');
    write('parent/deno.json', '{ "imports": { "a": "./a.ts" } }');
    const file = write('parent/app/deno.json', '{}');
    expect(readDenoConfig(file).importMap).toBeUndefined();
    expect(readDenoConfig(file).importMapFiles).toEqual([]);
  });

  it('ignores a parent config that does not list the directory', () => {
    setup();
    write('deno.json', '{ "workspace": ["./other"], "imports": { "a": "./a.ts" } }');
    const file = write('app/deno.json', '{}');
    expect(readDenoConfig(file).importMap).toBeUndefined();
  });
});

describe('deno workspace members', () => {
  it('lists the named members of the workspace from the root and from a member', () => {
    setup();
    const rootFile = write('deno.json', '{ "workspace": ["./app", "./packages/*", 1] }');
    const app = write('app/deno.json', '{ "name": "@x/app" }');
    write('packages/core/deno.json', '{ "name": "@x/core", "exports": "./mod.ts" }');
    write('packages/sub/deno.json', '{ "exports": { "./a": "./a.ts" } }');
    const names = (file: string): string[] => readDenoConfig(file).members.map(item => item.name);
    expect(names(rootFile)).toEqual(['@x/app', '@x/core']);
    expect(names(app)).toEqual(['@x/app', '@x/core']);
    expect(readDenoConfig(rootFile).members[1]).toEqual({
      name: '@x/core',
      directory: path.join(root, 'packages', 'core'),
      exports: { '.': './mod.ts' },
      importMap: undefined,
    });
  });

  it('adds the member import map to the root map and treats the root as a member', () => {
    setup();
    const rootFile = write(
      'deno.json',
      '{ "name": "@x/root", "exports": "./mod.ts", "workspace": ["./app", "./empty"], "imports": { "a": "./a.ts" } }',
    );
    write('app/deno.json', '{ "name": "@x/app", "imports": { "#util": "./util.ts" } }');
    write('empty/readme.md', '');
    const { members } = readDenoConfig(rootFile);
    expect(members.map(item => item.name)).toEqual(['@x/root', '@x/app']);
    expect(members[1]?.importMap).toEqual({
      imports: { a: path.join(root, 'a.ts'), '#util': './util.ts' },
      directory: path.join(root, 'app'),
    });
  });

  it('ignores a missing glob directory', () => {
    setup();
    const file = write('deno.json', '{ "workspace": ["./missing/*"] }');
    expect(readDenoConfig(file).members).toEqual([]);
  });
});
