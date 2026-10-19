import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { keepsUnusedImports } from '@/resolve/tsconfig.ts';

function project(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-tsconfig-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const keeps = '{ "compilerOptions": { "verbatimModuleSyntax": true } }';
const inRoot = (files: Record<string, string>): boolean => {
  const root = project(files);
  return keepsUnusedImports(path.join(root, 'src/a.ts'), root);
};

describe('a package name in extends', () => {
  it('reads a file of the package, with or without .json', () => {
    const base = {
      'node_modules/cfg/package.json': '{ "name": "cfg" }',
      'node_modules/cfg/base.json': keeps,
    };
    expect(inRoot({ ...base, 'tsconfig.json': '{ "extends": "cfg/base.json" }' })).toBe(true);
    expect(inRoot({ ...base, 'tsconfig.json': '{ "extends": ["./none.json", "cfg/base"] }' })).toBe(
      true,
    );
  });

  it('reads the tsconfig.json of a package folder, also when the package has a main', () => {
    const scoped = {
      'node_modules/@scope/cfg/package.json': '{ "name": "@scope/cfg" }',
      'node_modules/@scope/cfg/tsconfig.json': keeps,
      'tsconfig.json': '{ "extends": "@scope/cfg" }',
    };
    expect(inRoot(scoped)).toBe(true);
    expect(
      inRoot({
        ...scoped,
        'node_modules/@scope/cfg/package.json': '{ "name": "@scope/cfg", "main": "index.js" }',
        'node_modules/@scope/cfg/index.js': '',
      }),
    ).toBe(true);
  });

  it('reads the tsconfig.json of a folder before its main or index.json', () => {
    for (const [file, json] of [
      ['node_modules/cfg/package.json', '{ "name": "cfg", "main": "other.json" }'],
      ['node_modules/cfg/index.json', '{}'],
    ] as const) {
      const files = {
        'node_modules/cfg/package.json': '{ "name": "cfg" }',
        'node_modules/cfg/other.json': '{}',
        'node_modules/cfg/tsconfig.json': keeps,
        'tsconfig.json': '{ "extends": "cfg" }',
        [file]: json,
      };
      expect(inRoot(files)).toBe(true);
    }
  });
});

describe('a package with exports', () => {
  it('reads the config that its `.` entry names', () => {
    const files = {
      'node_modules/cfg/package.json': '{ "name": "cfg", "exports": { ".": "./tsconfig.json" } }',
      'node_modules/cfg/tsconfig.json': keeps,
      'tsconfig.json': '{ "extends": "cfg" }',
    };
    expect(inRoot(files)).toBe(true);
  });
});

const off = '{ "compilerOptions": { "verbatimModuleSyntax": false } }';
const cfg = (manifest: object): string => JSON.stringify({ name: 'cfg', ...manifest });

const turnsOff: [string, Record<string, string>][] = [
  [
    'a JSON main',
    {
      'node_modules/cfg/package.json': cfg({ main: 'other.json' }),
      'node_modules/cfg/other.json': off,
    },
  ],
  [
    'an index.json',
    { 'node_modules/cfg/package.json': cfg({}), 'node_modules/cfg/index.json': off },
  ],
  [
    'a main in a subfolder',
    {
      'node_modules/cfg/package.json': cfg({ main: './x/tsconfig.json' }),
      'node_modules/cfg/x/tsconfig.json': off,
    },
  ],
  [
    'a node condition before default',
    {
      'node_modules/cfg/package.json': cfg({
        exports: { '.': { node: './off.json', default: './on.json' } },
      }),
      'node_modules/cfg/off.json': off,
      'node_modules/cfg/on.json': keeps,
    },
  ],
  [
    'a tsconfig field',
    {
      'node_modules/cfg/package.json': cfg({ tsconfig: './on.json' }),
      'node_modules/cfg/on.json': keeps,
      'node_modules/cfg/tsconfig.json': off,
    },
  ],
  [
    'an exports entry for tsconfig.json',
    {
      'node_modules/cfg/package.json': cfg({ exports: { './tsconfig.json': './x.json' } }),
      'node_modules/cfg/x.json': off,
    },
  ],
];

describe('a package base after a relative base that keeps imports', () => {
  it.each(turnsOff)('does not remove what the relative base keeps: %s', (_name, files) => {
    expect(
      inRoot({ ...files, 'a.json': keeps, 'tsconfig.json': '{ "extends": ["./a.json", "cfg"] }' }),
    ).toBe(true);
  });
});

describe('a package import (#name) in extends', () => {
  it.each(['{ "#tsc": "./on.json" }', '{ "#dep": "./dep.js" }'])(
    'is skipped, so the result is what the relative bases give: %s',
    imports => {
      const files = {
        'package.json': `{ "name": "app", "imports": ${imports} }`,
        'on.json': keeps,
        'a.json': '{}',
        'tsconfig.json': '{ "extends": ["./a.json", "#tsc"] }',
      };
      expect(inRoot(files)).toBe(false);
    },
  );
});

describe('a package that exports a config with another name', () => {
  it('reads it, as @total-typescript/tsconfig maps ./tsc/dom/app', () => {
    const files = {
      'node_modules/cfg/package.json': cfg({ exports: { './tsc/dom/app': './tsc/dom/app.json' } }),
      'node_modules/cfg/tsc/dom/app.json': keeps,
      'tsconfig.json': '{ "extends": "cfg/tsc/dom/app" }',
    };
    expect(inRoot(files)).toBe(true);
  });

  it('reads the file that its `.` entry names', () => {
    const files = {
      'node_modules/cfg/package.json': cfg({ exports: { '.': './tsconfig.base.json' } }),
      'node_modules/cfg/tsconfig.base.json': keeps,
      'tsconfig.json': '{ "extends": "cfg" }',
    };
    expect(inRoot(files)).toBe(true);
  });
});

describe('a package that gives no base config', () => {
  it('gives no options for a file that the package does not export', () => {
    const files = {
      'node_modules/cfg/package.json': '{ "name": "cfg", "exports": { ".": "./index.js" } }',
      'node_modules/cfg/index.js': '',
      'node_modules/cfg/tsconfig.json': keeps,
      'tsconfig.json': '{ "extends": "cfg/tsconfig.json" }',
    };
    expect(inRoot(files)).toBe(false);
  });

  it('shows an error that is not a missing file', () => {
    const files = {
      'node_modules/cfg/package.json': '{ not json',
      'node_modules/cfg/tsconfig.json': keeps,
      'tsconfig.json': '{ "extends": "cfg/tsconfig.json" }',
    };
    expect(() => inRoot(files)).toThrow(/Invalid package config/u);
  });
});

describe('an empty name and an absolute path in extends', () => {
  it('skips an empty name', () => {
    expect(inRoot({ 'tsconfig.json': '{ "extends": "" }' })).toBe(false);
  });

  it('follows an absolute path as a file, with any extension', () => {
    const base = project({ 'base.json': keeps, 'base.jsonc': keeps });
    for (const file of ['base', 'base.jsonc']) {
      const extend = JSON.stringify({ extends: path.join(base, file) });
      expect(inRoot({ 'tsconfig.json': extend })).toBe(true);
    }
  });
});
