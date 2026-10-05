import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

describe('extracting CommonJS requires', () => {
  it('follows a required module bound to a name', () => {
    expect(usagesOf("const fs = require('fs');\nfs.watch('.');", 'lib/index.cjs')).toEqual([
      'api node:fs',
      'api node:fs.watch',
    ]);
  });

  it('follows nested destructuring', () => {
    const source =
      "const { promises: { watch: pw }, readFile } = require('fs');\npw('.');\nreadFile('a');";
    expect(usagesOf(source, 'lib/index.js')).toEqual([
      'api node:fs',
      'api node:fs.promises.watch',
      'api node:fs.readFile',
    ]);
  });

  it('follows interop helpers emitted by TypeScript and Babel', () => {
    const source = "const fs_1 = __importDefault(require('fs'));\nfs_1.default.unwatchFile('a');";
    expect(usagesOf(source, 'lib/index.js')).toEqual(['api node:fs', 'api node:fs.unwatchFile']);
  });

  it('follows require functions made by createRequire', () => {
    const source =
      "import { createRequire } from 'module';\nconst load = createRequire(import.meta.url);\nload('vm').runInThisContext('1');";
    expect(usagesOf(source)).toContain('api node:vm.runInThisContext');
  });

  it('reports requires with computed module names', () => {
    expect(usagesOf('module.exports = require(name);', 'lib/index.js')).toEqual([
      'dynamic require(<expression>)',
    ]);
  });

  it('does not treat a shadowed require as a module load', () => {
    expect(usagesOf("function load(require) { return require('fs'); }", 'lib/index.js')).toEqual(
      [],
    );
  });

  it('follows TypeScript import-equals declarations', () => {
    expect(usagesOf("import fs = require('fs');\nfs.watchFile('a');")).toEqual([
      'api node:fs',
      'api node:fs.watchFile',
    ]);
  });
});

describe('extracting bundler output', () => {
  it('follows the require helper in esbuild ESM output', () => {
    const source = "var __require = createShim();\nconst fs = __require('fs');\nfs.watch('.');";
    expect(usagesOf(source, 'dist/index.mjs')).toEqual(['api node:fs', 'api node:fs.watch']);
  });

  it('follows interop helpers emitted by Rollup', () => {
    const source =
      "var fs = require('fs');\nvar fs__namespace = _interopNamespaceDefault(fs);\nfs__namespace.watch('.');";
    expect(usagesOf(source, 'dist/index.cjs')).toContain('api node:fs.watch');
  });
});
