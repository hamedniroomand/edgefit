import { describe, expect, it } from 'vite-plus/test';

import { entrySource, packageEntries } from '@/package/entry.ts';

const subpaths = (manifest: object, options = {}): string[] =>
  packageEntries(manifest, 'pkg', options).map(entry => entry.subpath);

describe('packageEntries', () => {
  it('lists exports subpaths, skipping package.json, patterns, blocked and non-code targets', () => {
    expect(
      subpaths({
        exports: {
          '.': { import: './a.js', default: './a.cjs' },
          './client': './client.js',
          './package.json': './package.json',
          './features/*': './features/*.js',
          './private': null,
          './styles.css': './styles.css',
          './data': './data.json',
        },
      }),
    ).toEqual(['.', './client']);
  });

  it('treats a string, an array or a bare condition object as the root entry', () => {
    expect(subpaths({ exports: './index.js' })).toEqual(['.']);
    expect(subpaths({ exports: ['./index.js'] })).toEqual(['.']);
    expect(subpaths({ exports: { import: './a.mjs', default: './a.js' } })).toEqual(['.']);
  });

  it('falls back to the root without exports', () => {
    expect(subpaths({ main: './main.js' })).toEqual(['.']);
    expect(subpaths({})).toEqual(['.']);
  });

  it('honors only and skip', () => {
    const exports = { '.': './a.js', './a': './a.js', './b': './b.js' };
    expect(subpaths({ exports }, { only: ['./a'] })).toEqual(['./a']);
    expect(subpaths({ exports }, { skip: ['./a'] })).toEqual(['.', './b']);
  });

  it('builds the import specifier', () => {
    expect(
      packageEntries({ exports: { '.': './a.js', './x': './x.js' } }, '@s/p').map(
        entry => entry.specifier,
      ),
    ).toEqual(['@s/p', '@s/p/x']);
  });

  it('imports every export through a namespace', () => {
    expect(entrySource('@s/p/x')).toBe('import * as m from "@s/p/x";\nexport { m };\n');
  });
});
