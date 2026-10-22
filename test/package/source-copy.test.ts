import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { EdgefitError } from '@/errors.ts';
import { copyWithoutPrepare } from '@/package/source-copy.ts';

let root: string;
let source: string;
let destination: string;
const write = (file: string, text: string): void => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const manifestOf = (directory: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as Record<string, unknown>;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'edgefit-copy-'));
  source = path.join(root, 'source');
  destination = path.join(root, 'copy');
  write(path.join(source, 'index.js'), 'export {};\n');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('copyWithoutPrepare', () => {
  it('removes only the prepare script and leaves the source unchanged', async () => {
    const text = JSON.stringify({ name: 'a', scripts: { prepare: 'x', build: 'y' } });
    write(path.join(source, 'package.json'), text);
    await copyWithoutPrepare(source, destination);
    expect(manifestOf(destination)).toEqual({ name: 'a', scripts: { build: 'y' } });
    expect(readFileSync(path.join(source, 'package.json'), 'utf8')).toBe(text);
    expect(existsSync(path.join(destination, 'index.js'))).toBe(true);
  });

  it('accepts a package.json that has a byte order mark or no scripts', async () => {
    write(
      path.join(source, 'package.json'),
      `${String.fromCodePoint(0xfeff)}${JSON.stringify({ name: 'a', scripts: 1 })}`,
    );
    await copyWithoutPrepare(source, destination);
    expect(manifestOf(destination)).toEqual({ name: 'a', scripts: 1 });
  });

  it('skips .git, and skips node_modules unless the package bundles dependencies', async () => {
    write(path.join(source, 'package.json'), '{"name":"a"}');
    write(path.join(source, '.git', 'HEAD'), 'ref');
    write(path.join(source, 'node_modules', 'dep', 'index.js'), '');
    write(path.join(source, 'lib', 'node_modules', 'nested.js'), '');
    await copyWithoutPrepare(source, destination);
    expect(existsSync(path.join(destination, '.git'))).toBe(false);
    expect(existsSync(path.join(destination, 'node_modules'))).toBe(false);
    expect(existsSync(path.join(destination, 'lib', 'node_modules', 'nested.js'))).toBe(true);

    rmSync(destination, { recursive: true });
    write(path.join(source, 'package.json'), '{"name":"a","bundledDependencies":["dep"]}');
    await copyWithoutPrepare(source, destination);
    expect(existsSync(path.join(destination, 'node_modules', 'dep', 'index.js'))).toBe(true);
  });
});

describe('copyWithoutPrepare with links and a damaged package.json', () => {
  it('does not write through a source directory that is a symbolic link', async () => {
    const real = path.join(root, 'real');
    const text = JSON.stringify({ name: 'a', scripts: { prepare: 'x' } });
    write(path.join(real, 'package.json'), text);
    write(path.join(real, 'index.js'), 'export {};\n');
    rmSync(source, { recursive: true });
    symlinkSync(real, source, 'dir');
    await copyWithoutPrepare(source, destination);
    expect(lstatSync(destination).isSymbolicLink()).toBe(false);
    expect(manifestOf(destination)).toEqual({ name: 'a', scripts: {} });
    expect(readFileSync(path.join(real, 'package.json'), 'utf8')).toBe(text);
  });

  it('copies a symbolic link as a link, and does not write through a linked package.json', async () => {
    const outside = path.join(root, 'outside.json');
    write(outside, '{"name":"a","scripts":{"prepare":"x"}}');
    symlinkSync(outside, path.join(source, 'package.json'));
    const elsewhere = mkdtempSync(path.join(tmpdir(), 'edgefit-copy-link-'));
    writeFileSync(path.join(elsewhere, 'secret.txt'), 'x');
    symlinkSync(elsewhere, path.join(source, 'up'));
    await copyWithoutPrepare(source, destination);
    rmSync(elsewhere, { recursive: true });
    expect(lstatSync(path.join(destination, 'up')).isSymbolicLink()).toBe(true);
    expect(lstatSync(path.join(destination, 'package.json')).isSymbolicLink()).toBe(false);
    expect(manifestOf(destination)).toEqual({ name: 'a', scripts: {} });
    expect(readFileSync(outside, 'utf8')).toContain('"prepare"');
  });

  it('does not hide an error that does not mean a missing file', async () => {
    mkdirSync(path.join(source, 'package.json'));
    await expect(copyWithoutPrepare(source, destination)).rejects.toMatchObject({ code: 'EISDIR' });
  });

  it.each([
    ['is missing', undefined],
    ['is not JSON', '{'],
    ['is not an object', '[]'],
    ['is null', 'null'],
  ])('reports a package.json that %s', async (_name, text) => {
    if (text !== undefined) {
      write(path.join(source, 'package.json'), text);
    }
    await expect(copyWithoutPrepare(source, destination)).rejects.toBeInstanceOf(EdgefitError);
  });
});
