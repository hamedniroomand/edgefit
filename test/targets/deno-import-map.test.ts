import { describe, expect, it } from 'vite-plus/test';

import { applyImportMap, jsrSpecifier, npmSpecifier } from '@/targets/deno/import-map.ts';

const map = {
  directory: '/project',
  imports: {
    chalk: 'npm:chalk@5',
    'chalk/': 'npm:/chalk@5.3.0/',
    '@std/path': 'jsr:@std/path@^1',
    '~/': './src/',
    config: './config.ts',
  },
};

describe('import maps', () => {
  it('maps exact keys', () => {
    expect(applyImportMap('chalk', map)).toBe('npm:chalk@5');
    expect(applyImportMap('@std/path', map)).toBe('jsr:@std/path@^1');
  });

  it('prefers the longest prefix key', () => {
    expect(applyImportMap('chalk/ansi', map)).toBe('npm:/chalk@5.3.0/ansi');
  });

  it('maps subpaths of package keys without a trailing slash, like Deno', () => {
    expect(applyImportMap('@std/path/join', map)).toBe('jsr:@std/path@^1/join');
    expect(applyImportMap('config/extra', map)).toBeUndefined();
  });

  it('resolves relative targets against the config directory', () => {
    expect(applyImportMap('~/lib/a.ts', map)).toBe('/project/src/lib/a.ts');
    expect(applyImportMap('config', map)).toBe('/project/config.ts');
  });

  it('leaves unmapped specifiers alone', () => {
    expect(applyImportMap('react', map)).toBeUndefined();
  });
});

describe('npm specifiers', () => {
  it.each([
    ['npm:chalk', 'chalk'],
    ['npm:chalk@5.3.0', 'chalk'],
    ['npm:/chalk@5/ansi', 'chalk/ansi'],
    ['npm:@scope/pkg@^1.2/sub/path.js', '@scope/pkg/sub/path.js'],
    ['npm:@scope/pkg', '@scope/pkg'],
  ])('reads %s as %s', (specifier, bare) => {
    expect(npmSpecifier(specifier)).toBe(bare);
  });

  it('ignores other specifiers', () => {
    expect(npmSpecifier('chalk')).toBeUndefined();
    expect(npmSpecifier('jsr:@std/path')).toBeUndefined();
  });
});

describe('jsrSpecifier', () => {
  it('reads the package and the export key', () => {
    expect(jsrSpecifier('jsr:@acme/core')).toEqual({ name: '@acme/core', key: '.' });
    expect(jsrSpecifier('jsr:/@acme/core@^1.2/extra')).toEqual({
      name: '@acme/core',
      key: './extra',
    });
  });

  it('ignores unscoped and other specifiers', () => {
    expect(jsrSpecifier('jsr:core')).toBeUndefined();
    expect(jsrSpecifier('npm:@acme/core')).toBeUndefined();
  });
});
