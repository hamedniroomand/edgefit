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

describe('reading whether the bundler keeps unused imports', () => {
  it('is false without a tsconfig or without the options', () => {
    expect(keepsUnusedImports(path.join(project({}), 'src/a.ts'))).toBe(false);
    const root = project({ 'tsconfig.json': '{ "compilerOptions": { "strict": true } }' });
    expect(keepsUnusedImports(path.join(root, 'src/a.ts'))).toBe(false);
  });

  it('is true for verbatimModuleSyntax and preserveValueImports', () => {
    for (const name of ['verbatimModuleSyntax', 'preserveValueImports']) {
      const root = project({
        'tsconfig.json': `// note\n{ "compilerOptions": { "${name}": true, }, }`,
      });
      expect(keepsUnusedImports(path.join(root, 'src/a.ts'))).toBe(true);
    }
  });

  it('uses the nearest tsconfig and follows a relative extends', () => {
    const root = project({
      'tsconfig.base.json': '{ "compilerOptions": { "verbatimModuleSyntax": true } }',
      'tsconfig.json': '{ "extends": "./tsconfig.base" }',
      'packages/a/tsconfig.json': '{ "extends": "../../tsconfig.base.json" }',
      'packages/b/tsconfig.json': '{ "compilerOptions": { "verbatimModuleSyntax": false } }',
    });
    expect(keepsUnusedImports(path.join(root, 'src/a.ts'))).toBe(true);
    expect(keepsUnusedImports(path.join(root, 'packages/a/src/a.ts'))).toBe(true);
    expect(keepsUnusedImports(path.join(root, 'packages/b/src/a.ts'))).toBe(false);
  });
});

describe('reading the tsconfig options that keep imports', () => {
  it('reads importsNotUsedAsValues', () => {
    for (const [value, expected] of [
      ['preserve', true],
      ['error', true],
      ['remove', false],
    ] as const) {
      const root = project({
        'tsconfig.json': `{ "compilerOptions": { "importsNotUsedAsValues": "${value}" } }`,
      });
      expect(keepsUnusedImports(path.join(root, 'src/a.ts'))).toBe(expected);
    }
  });

  it('merges the options of a config with the ones it extends', () => {
    const root = project({
      'base.json': '{ "compilerOptions": { "verbatimModuleSyntax": true } }',
      'tsconfig.json':
        '{ "extends": "./base.json", "compilerOptions": { "importsNotUsedAsValues": "remove" } }',
    });
    expect(keepsUnusedImports(path.join(root, 'src/a.ts'))).toBe(true);
  });
});

describe('reading a tree of extended configs', () => {
  it('reads a config that two configs in a list both extend', () => {
    const root = project({
      'base.json': '{ "compilerOptions": { "verbatimModuleSyntax": true } }',
      'b.json':
        '{ "extends": "./base.json", "compilerOptions": { "verbatimModuleSyntax": false } }',
      'c.json': '{ "extends": "./base.json" }',
      'tsconfig.json': '{ "extends": ["./b.json", "./c.json"] }',
    });
    expect(keepsUnusedImports(path.join(root, 'src/a.ts'))).toBe(true);
  });

  it('lets the last config in an extends list win', () => {
    const root = project({
      'a.json': '{ "compilerOptions": { "verbatimModuleSyntax": true } }',
      'b.json': '{ "compilerOptions": { "verbatimModuleSyntax": false } }',
      'c.json': '{}',
      'one/tsconfig.json': '{ "extends": ["../a.json", "../b.json"] }',
      'two/tsconfig.json': '{ "extends": ["../b.json", "../a.json"] }',
      'three/tsconfig.json': '{ "extends": ["../a.json", "../c.json"] }',
    });
    expect(keepsUnusedImports(path.join(root, 'one/a.ts'))).toBe(false);
    expect(keepsUnusedImports(path.join(root, 'two/a.ts'))).toBe(true);
    expect(keepsUnusedImports(path.join(root, 'three/a.ts'))).toBe(true);
  });

  it('stops at a package extends and at a loop', () => {
    const root = project({
      'tsconfig.json': '{ "extends": "@tsconfig/node22/tsconfig.json" }',
      'loop/tsconfig.json': '{ "extends": "./tsconfig.json" }',
    });
    expect(keepsUnusedImports(path.join(root, 'src/a.ts'))).toBe(false);
    expect(keepsUnusedImports(path.join(root, 'loop/a.ts'))).toBe(false);
  });
});
