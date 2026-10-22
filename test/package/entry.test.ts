import { describe, expect, it } from 'vite-plus/test';

import { entrySource, packageEntries } from '@/package/entry.ts';

const subpaths = (manifest: object, options = {}): string[] =>
  packageEntries(manifest, 'pkg', options).entries.map(entry => entry.subpath);
const skipped = (manifest: object, options = {}): string[][] =>
  packageEntries(manifest, 'pkg', options).skipped.map(item => [item.subpath, item.reason]);

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
      packageEntries({ exports: { '.': './a.js', './x': './x.js' } }, '@s/p').entries.map(
        entry => entry.specifier,
      ),
    ).toEqual(['@s/p', '@s/p/x']);
  });
});

describe('packageEntries with targets that are not scripts', () => {
  it('skips a subpath whose targets are not scripts, and says why', () => {
    const exports = {
      '.': './a.js',
      './dist/a.js.map': './dist/a.js.map',
      './data': './data.json',
      './styles.css': './styles.css',
      './types': { types: './types.d.ts', default: './types.d.mts' },
      './logo': './logo.SVG',
      './module': './module.wasm',
      './addon': './build/addon.node',
      './mixed': ['./mixed.json', './mixed.map'],
    };
    expect(subpaths({ exports })).toEqual(['.']);
    expect(skipped({ exports })).toEqual([
      ['./dist/a.js.map', 'no target of this subpath is a script file (.map)'],
      ['./data', 'the target of this subpath is a JSON file, which holds no code to check'],
      ['./styles.css', 'no target of this subpath is a script file (.css)'],
      ['./types', 'no target of this subpath is a script file (.d.ts, .d.mts)'],
      ['./logo', 'no target of this subpath is a script file (.svg)'],
      ['./module', 'no target of this subpath is a script file (.wasm)'],
      ['./addon', 'no target of this subpath is a script file (.node)'],
      ['./mixed', 'no target of this subpath is a script file (.json, .map)'],
    ]);
  });

  it('keeps a subpath that has a script among its targets, or no extension', () => {
    const exports = {
      './a': { types: './a.d.ts', default: './a.js' },
      './b': ['./b.json', './b.cjs'],
      './c': './bin/c',
      './d': { import: './d.mts', require: './d.cts' },
      './e': './e.TSX',
    };
    expect(subpaths({ exports })).toEqual(['./a', './b', './c', './d', './e']);
    expect(skipped({ exports })).toEqual([]);
  });
});

describe('packageEntries and the subpaths it leaves out', () => {
  it('does not list a subpath that the package blocks, a pattern, package.json or an excluded one', () => {
    const exports = {
      './private': null,
      './package.json': './package.json',
      './maps/*': './maps/*.map',
      './x.map': './x.map',
      './y.map': './y.map',
    };
    expect(skipped({ exports })).toEqual([
      ['./x.map', 'no target of this subpath is a script file (.map)'],
      ['./y.map', 'no target of this subpath is a script file (.map)'],
    ]);
    expect(skipped({ exports }, { skip: ['./x.map'] })).toEqual([
      ['./y.map', 'no target of this subpath is a script file (.map)'],
    ]);
    expect(skipped({ exports }, { only: ['./y.map'] })).toEqual([
      ['./y.map', 'no target of this subpath is a script file (.map)'],
    ]);
  });

  it('skips the root when the whole exports field is not a script', () => {
    expect(subpaths({ exports: './data.json' })).toEqual([]);
    expect(skipped({ exports: './data.json' })).toEqual([
      ['.', 'the target of this subpath is a JSON file, which holds no code to check'],
    ]);
  });

  it('imports every export through a namespace', () => {
    expect(entrySource('@s/p/x')).toBe('import * as m from "@s/p/x";\nexport { m };\n');
  });
});
