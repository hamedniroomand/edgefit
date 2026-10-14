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
