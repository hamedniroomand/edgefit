import { describe, expect, it } from 'vite-plus/test';

import { build, entry, reached } from './reached.ts';
import type { Source } from './reached.ts';

const cjs = (code: string): Source => ({ code: `const fs = require('node:fs');\n${code}` });

const exportsAB =
  "exports.a = function () {\n  return fs.watch('.');\n};\nexports.b = function () {\n  return fs.statSync('.');\n};\n";

const reachedBy = (index: string, flag: string): string[] | undefined =>
  reached({
    'index.js': entry(index, { './lib.js': 'lib.js' }),
    'lib.js': cjs(`${flag}\n${exportsAB}`),
  })['lib.js'];

const defaultImport = "import lib from './lib.js';\nlib.a();";

describe('an __esModule marker that is not known to be true', () => {
  it.each([
    'exports.__esModule = false;',
    'exports.__esModule = 0;',
    'exports.__esModule = flag;',
    "Object.defineProperty(exports, '__esModule', { value: false });",
    "Object.defineProperty(exports, '__esModule', { get: () => true });",
    'exports.__esModule = void 0;',
    'exports.__esModule = null;',
    'exports.__esModule = !1;',
    'module.exports.__esModule = false;',
    "Object.defineProperty(module.exports, '__esModule', { value: false });",
    "Object.defineProperty(exports, '__esModule', { value: true, value: false });",
    "Object.defineProperty(exports, '__esModule', { value: true, ...descriptor });",
    "Object.defineProperty(exports, '__esModule', { value: true, [key]: false });",
    'exports.__esModule = true;\nexports.__esModule = false;',
    "Object.defineProperty(exports, '__esModule', { value: false });\nexports.__esModule = true;",
    "Object.defineProperty(exports, '__esModule', { value: false });\nmodule.exports.__esModule = true;",
    "Object.defineProperty(exports, '__esModule', { value: true });\nexports.__esModule = false;",
    "Object.defineProperty(exports, '__esModule', { ...descriptor, value: true });\nexports.__esModule = false;",
    "Object.defineProperty(exports, '__esModule', { value: true, writable: writable });\nexports.__esModule = false;",
    "exports.__esModule = true;\nObject.defineProperty(exports, '__esModule', { value: true });\nexports.__esModule = false;",
  ])('makes a default import use every export: %s', flag => {
    expect(reachedBy(defaultImport, flag)).toEqual(['node:fs.watch', 'node:fs.statSync']);
  });
});

describe('an __esModule marker that is true', () => {
  it.each([
    'exports.__esModule = true;',
    'exports.__esModule = !0;',
    'exports.__esModule = 1;',
    "Object.defineProperty(exports, '__esModule', { value: true });",
    "Object.defineProperty(exports, '__esModule', { value: !0 });",
    "exports.__esModule = 'yes';",
    'exports.__esModule = -1;',
    'exports.__esModule = !!1;',
    'exports.__esModule = false;\nexports.__esModule = true;',
    "Object.defineProperty(exports, '__esModule', { ...descriptor, value: true });",
  ])('gives the module a default export of its own: %s', flag => {
    const { modules } = build({ 'lib.js': cjs(`${flag}\n${exportsAB}`) });
    expect(modules.get('lib.js')?.shape?.esModule).toBe(true);
    expect(reachedBy(defaultImport, flag)).toEqual([]);
  });
});

describe('a named import', () => {
  it.each(['exports.__esModule = false;', 'exports.__esModule = true;'])(
    'uses only the export that it names: %s',
    flag => {
      expect(reachedBy("import { a } from './lib.js';\na();", flag)).toEqual(['node:fs.watch']);
    },
  );
});

describe('a later write after Object.defineProperty', () => {
  it('keeps the mark when writable is true and the later value is true, as before (a guard)', () => {
    const flag =
      "Object.defineProperty(exports, '__esModule', { value: false, writable: true });\nexports.__esModule = true;";
    expect(reachedBy(defaultImport, flag)).toEqual([]);
  });

  it('clears the mark on the new module.exports object', () => {
    const code =
      "Object.defineProperty(exports, '__esModule', { value: true });\nmodule.exports = { a() { return fs.watch('.'); } };\nmodule.exports.__esModule = false;";
    const found = reached({
      'index.js': entry(defaultImport, { './lib.js': 'lib.js' }),
      'lib.js': cjs(code),
    })['lib.js'];
    expect(found).toEqual(['node:fs.watch']);
  });
});

const inNodeMode = (index: string, imports: Record<string, string>, lib: string): string[] =>
  reached({
    'index.js': { ...entry(index, imports), nodeMode: true },
    'lib.js': cjs(lib),
  })['lib.js'] ?? [];

const marked = `exports.__esModule = true;\n${exportsAB}`;
const toLib = { './lib.js': 'lib.js' };

describe('a default import in node mode', () => {
  it.each([
    defaultImport,
    "import { default as lib } from './lib.js';\nlib.a();",
    "import lib, { a } from './lib.js';\nlib.a();",
    "import * as ns from './lib.js';\nns.default.a();",
  ])('uses every export, whatever __esModule says: %s', index => {
    expect(inNodeMode(index, toLib, marked)).toEqual(['node:fs.watch', 'node:fs.statSync']);
  });

  it('uses every export through import()', () => {
    const index = "const lib = await import('./lib.js');\nlib.default.a();";
    expect(inNodeMode(index, { 'dynamic-import:./lib.js': 'lib.js' }, marked)).toEqual([
      'node:fs.watch',
      'node:fs.statSync',
    ]);
  });

  it('uses every export through a re-export of default', () => {
    const found = reached({
      'index.js': entry("import lib from './mid.js';\nlib.a();", { './mid.js': 'mid.js' }),
      'mid.js': { ...entry("export { default } from './lib.js';", toLib), nodeMode: true },
      'lib.js': cjs(marked),
    })['lib.js'];
    expect(found).toEqual(['node:fs.watch', 'node:fs.statSync']);
  });

  it('keeps only `default` of a require, which is module.exports itself', () => {
    const index = "const lib = require('./lib.js');\nlib.default.a();";
    expect(inNodeMode(index, { 'require-call:./lib.js': 'lib.js' }, marked)).toEqual([]);
  });

  it('keeps only `default` of an ES module', () => {
    const lib =
      "export default function () {\n  return fs.watch('.');\n}\nexport function b() {\n  return fs.statSync('.');\n}";
    const found = reached({
      'index.js': { ...entry("import lib from './lib.js';\nlib();", toLib), nodeMode: true },
      'lib.js': { code: `const fs = require('node:fs');\n${lib}` },
    })['lib.js'];
    expect(found).toEqual(['node:fs.watch']);
  });

  it('keeps the __esModule rule out of node mode', () => {
    expect(reachedBy("import * as ns from './lib.js';\nns.default.a();", marked)).toEqual([]);
  });
});

describe('a mark and a later module.exports', () => {
  const object = "module.exports = { a() { return fs.watch('.'); } };";
  const reachedOf = (lib: string): string[] | undefined =>
    reached({ 'index.js': entry(defaultImport, toLib), 'lib.js': cjs(lib) })['lib.js'];

  it.each([
    `exports.__esModule = true;\n${object}`,
    `Object.defineProperty(exports, '__esModule', { value: true });\n${object}`,
    `${object}\nexports.__esModule = true;`,
    `${object}\nObject.defineProperty(exports, '__esModule', { value: true });`,
  ])('drops a mark that is not on the new object: %s', lib => {
    expect(reachedOf(lib)).toEqual(['node:fs.watch']);
  });

  it.each([
    `${object}\nmodule.exports.__esModule = true;`,
    `${object}\nObject.defineProperty(module.exports, '__esModule', { value: true });`,
  ])('keeps a mark on the new object: %s', lib => {
    expect(reachedOf(lib)).toEqual([]);
  });
});
