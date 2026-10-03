import { describe, expect, it } from 'vite-plus/test';

import { entry, fs, reached, twoHelpers } from './reached.ts';

const importedBy = (code: string, specifier: string): Record<string, string[]> =>
  reached({
    'index.js': entry(code, { [specifier]: 'lib.js' }),
    'lib.js': twoHelpers,
  });

describe('imports that may reach any export', () => {
  it('keeps everything for a namespace that is passed on', () => {
    expect(importedBy("import * as lib from './lib.js';\nuse(lib);", './lib.js')['lib.js']).toEqual(
      ['node:fs.watch'],
    );
  });

  it('asks only for the members that are read from a namespace import', () => {
    expect(
      importedBy("import * as lib from './lib.js';\nlib.upper('a');", './lib.js')['lib.js'],
    ).toEqual([]);
  });
});

describe('imports that are not a static import of names', () => {
  it('keeps everything for import() and require()', () => {
    expect(importedBy("await import('./lib.js');", 'dynamic-import:./lib.js')['lib.js']).toEqual([
      'node:fs.watch',
    ]);
    expect(
      importedBy("const lib = require('./lib.js');\nlib.upper(lib);", 'require-call:./lib.js')[
        'lib.js'
      ],
    ).toEqual(['node:fs.watch']);
  });

  it('keeps everything for an import whose specifier is not in the source', () => {
    expect(importedBy("import { upper } from './lib.js';", '?')['lib.js']).toEqual([
      'node:fs.watch',
    ]);
    expect(
      importedBy("import { upper } from './lib.js';", 'import-statement:./other.js')['lib.js'],
    ).toEqual(['node:fs.watch']);
  });

  it('keeps everything in a CommonJS module that is not read by name, and what it requires', () => {
    const found = reached({
      'index.js': entry("import { upper } from './lib.js';", { './lib.js': 'lib.js' }),
      'lib.js': {
        code: `const fs = require('node:fs');\nfunction watchDir(dir) {\n  return fs.watch(dir);\n}\nmodule.exports = watchDir;`,
        imports: { 'require-call:./more.js': 'more.js' },
      },
      'more.js': twoHelpers,
    });
    expect(found['lib.js']).toEqual(['node:fs.watch']);
    expect(found['more.js']).toEqual(['node:fs.watch']);
  });

  it('keeps everything in a module that reads its own exports', () => {
    const code = `${fs}export function watchDir(dir) {\n  return fs.watch(dir);\n}\nconsole.log(typeof module);`;
    expect(
      reached({
        'index.js': entry("import './lib.js';", { './lib.js': 'lib.js' }),
        'lib.js': { code },
      })['lib.js'],
    ).toEqual(['node:fs.watch']);
  });
});

describe('modules that import each other', () => {
  it('stops at a cycle', () => {
    const found = reached({
      'index.js': entry("import { a } from './a.js';\na();", { './a.js': 'a.js' }),
      'a.js': entry(
        `${fs}import { b } from './b.js';\nexport function a() {\n  fs.watch('.');\n  b();\n}`,
        {
          './b.js': 'b.js',
        },
      ),
      'b.js': entry(
        `${fs}import { a } from './a.js';\nexport function b() {\n  fs.watchFile('.');\n  a();\n}\nexport function c() {\n  fs.unwatchFile('.');\n}`,
        {
          './a.js': 'a.js',
        },
      ),
    });
    expect(found['a.js']).toEqual(['node:fs.watch']);
    expect(found['b.js']).toEqual(['node:fs.watchFile']);
  });
});
