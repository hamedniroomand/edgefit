import { describe, expect, it } from 'vite-plus/test';

import { entry, reached } from './reached.ts';

const fs = "const fs = require('node:fs');\n";
const exported =
  "exports.used = used;\nexports.dead = dead;\nfunction used() {\n  return fs.watch('.');\n}\nfunction dead() {\n  return fs.watchFile('.');\n}\n";
const both = ['node:fs.watch', 'node:fs.watchFile'];

/** The API usages that `lib.js` keeps when the entry uses only its `used` export. */
const reachedIn = (code: string): string[] | undefined =>
  reached({
    'index.js': entry("import { used } from './lib.js';\nused();", { './lib.js': 'lib.js' }),
    'lib.js': { code: `${fs}${exported}${code}` },
  })['lib.js'];

describe('a CommonJS module with a local binding named exports or module', () => {
  it.each([
    ['a parameter', 'function read(exports) {\n  return exports.value;\n}'],
    [
      'a destructured parameter',
      'class Parser {\n  constructor(client, { exports }) {\n    this.llhttp = exports;\n  }\n}',
    ],
    ['a const', 'function make() {\n  const exports = {};\n  exports.a = 1;\n  return exports;\n}'],
    ['a var in a function', 'function make() {\n  var exports = {};\n  return exports.a;\n}'],
    ['a catch parameter', 'try {\n  run();\n} catch (exports) {\n  log(exports.message);\n}'],
  ])('reads the exports when %s declares the name', (_, code) => {
    expect(reachedIn(code)).toEqual(['node:fs.watch']);
  });

  it('is checked in full when a free mention is outside the function that declares the name', () => {
    expect(
      reachedIn('function read(exports) {\n  return exports.value;\n}\nwrap(exports);'),
    ).toEqual(both);
  });

  it('is checked in full when a parameter default reads the exports that the body declares', () => {
    expect(reachedIn('function make(a = exports) {\n  var exports = {};\n  return a;\n}')).toEqual(
      both,
    );
  });

  it('is checked in full when a top-level var declares the name', () => {
    expect(reachedIn('var exports = {};\nexports.a = 1;')).toEqual(both);
  });
});

describe('a local binding that does not hide the module scope', () => {
  it('is checked in full when a switch tests a free mention and a case declares the name', () => {
    expect(reachedIn('switch ((exports.dead = 2)) {\n  default:\n    let exports = 1;\n}')).toEqual(
      both,
    );
  });

  it.each([
    ['a var', 'function make() {\n  var module = {};\n  return module.exports;\n}'],
    ['a parameter', 'function define(module) {\n  module.exports = 1;\n}'],
  ])('is checked in full when %s declares module', (_, code) => {
    expect(reachedIn(code)).toEqual(both);
  });

  it('is checked in full when a decorator of a parameter named exports reads the exports', () => {
    const code = `${fs}${exported}class Client {\n  constructor(@Inject(wrap(exports)) exports) {}\n}`;
    const result = reached({
      'index.js': entry("import { used } from './lib.ts';\nused();", { './lib.ts': 'lib.ts' }),
      'lib.ts': { code },
    });
    expect(result['lib.ts']).toEqual(both);
  });

  it('is checked in full when a parameter named eval runs code', () => {
    expect(
      reachedIn("function run(eval, code) {\n  return eval(code);\n}\nrun(globalThis.eval, 'x');"),
    ).toEqual(both);
  });
});

describe('a bundle that declares module and exports in its wrapper functions', () => {
  it('is checked in full with the esbuild __commonJS runtime', () => {
    const runtime =
      'var __getOwnPropNames = Object.getOwnPropertyNames;\nvar __commonJS = (cb, mod) => function __require() {\n  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;\n};\nvar require_dep = __commonJS({\n  "dep.js"(exports, module) {\n    module.exports = { a: 1 };\n  }\n});';
    expect(reachedIn(runtime)).toEqual(both);
  });

  it('is checked in full with the webpack runtime', () => {
    const runtime =
      'var __webpack_modules__ = {\n  12: function (module, exports, __webpack_require__) {\n    module.exports = 1;\n  }\n};\nvar __webpack_module_cache__ = {};\nfunction __webpack_require__(moduleId) {\n  var cachedModule = __webpack_module_cache__[moduleId];\n  if (cachedModule !== undefined) {\n    return cachedModule.exports;\n  }\n  var module = __webpack_module_cache__[moduleId] = { exports: {} };\n  __webpack_modules__[moduleId](module, module.exports, __webpack_require__);\n  return module.exports;\n}';
    expect(reachedIn(runtime)).toEqual(both);
  });

  it('is checked in full with a UMD wrapper', () => {
    const umd =
      "(function (global, factory) {\n  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) : factory(global.lib = {});\n})(this, function (exports) {\n  exports.version = 1;\n});";
    expect(reachedIn(umd)).toEqual(both);
  });
});
