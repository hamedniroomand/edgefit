import { describe, expect, it } from 'vite-plus/test';

import { both, calledOf, dead, fs, libOf, loadedOf, used } from './cjs-lib.ts';
import { entry, reached } from './reached.ts';

describe('a CommonJS module that keeps an export in a local name and uses this', () => {
  const body = "function () {\n  return fs.watch('.');\n}";

  it.each([
    ['a computed read', `const used = exports.used = ${body};`, "this['used']()"],
    [
      'a local name that is not the export name',
      `const local = exports.used = ${body};`,
      'this.used()',
    ],
  ])('is checked in full for %s through this', (_, alias, read) => {
    const other = `exports.other = function () {\n  return ${read};\n};\n`;
    expect(calledOf(`${alias}\n${other}`, 'other')).toEqual(['node:fs.watch']);
  });

  it('is checked in full for a chain when a class method uses this', () => {
    const box = 'class Box {\n  get() {\n    return this.value;\n  }\n}\n';
    expect(libOf(`${used}${dead}${box}module.exports = exports = { used, dead, Box };\n`)).toEqual(
      both,
    );
  });

  it('reads a property write after a whole write when the value uses this', () => {
    const value = 'function request() {\n  return this.helper();\n}\nmodule.exports = request;\n';
    const helper = "module.exports.helper = function () {\n  return fs.stat('.');\n};\n";
    expect(loadedOf(`${value}${helper}`)).toEqual([]);
  });
});

describe('a CommonJS module that can reach its own exports without the names exports and module', () => {
  const watch = "const local = exports.used = function () {\n  return fs.watch('.');\n};\n";
  const other = (read: string): string => `exports.other = function () {\n  return ${read};\n};\n`;

  it.each([
    ['arguments[0] in a name', `const self = arguments[0];\n${watch}${other("self['used']()")}`],
    ['arguments[0] in an arrow', `${watch}exports.other = () => arguments[0].used();\n`],
    ['require(__filename)', `${watch}${other('require(__filename).used()')}`],
    [
      'a require of a value',
      `const path = './lib' + '.js';\n${watch}${other('require(path).used()')}`,
    ],
    [
      'the caller of a function',
      `function inner() {\n  return inner.caller['argu' + 'ments'][0];\n}\nconst ex = inner();\n${watch}${other('ex.used()')}`,
    ],
  ])('is checked in full for a local name of an export and %s', (_, code) => {
    expect(libOf(code, 'other')).toEqual(['node:fs.watch']);
  });

  it('is checked in full for a chain and require(__filename)', () => {
    const helper = "function helper() {\n  return fs.stat('.');\n}\n";
    const run = "function run() {\n  return require(__filename)['helper']();\n}\n";
    const code = `module.exports = exports = { run, helper };\n${run}${helper}`;
    expect(libOf(code, 'run')).toEqual(['node:fs.stat']);
  });

  it('keeps a read through a require of its own path', () => {
    const files = {
      'index.js': entry("import { other } from './lib.js';\nother();", { './lib.js': 'lib.js' }),
      'lib.js': {
        code: `${fs}${watch}${other("require('./lib.js')['used']()")}`,
        imports: { 'require-call:./lib.js': 'lib.js' },
      },
    };
    expect(reached(files)['lib.js']).toEqual(['node:fs.watch']);
  });
});

describe('a CommonJS module that writes a property after a whole write and can reach its own exports', () => {
  const form1 =
    "function request() {}\nmodule.exports = request;\nmodule.exports.helper = function () {\n  return fs.stat('.');\n};\n";

  it.each([
    ['require(__filename)', 'require(__filename).helper();\n'],
    ['arguments[1].cache', 'arguments[1].cache[__filename].exports.helper();\n'],
    ['require.cache', 'require.cache[__filename].exports.helper();\n'],
    ['arguments with a computed key', "arguments[2]['exp' + 'orts'].helper();\n"],
    ['a require of a value', 'const path = __filename;\nrequire(path).helper();\n'],
    ['require in parentheses', '(require)(__filename).helper();\n'],
    ['require in a sequence', '(0, require)(__filename).helper();\n'],
    ['a copy of require', 'const r = require;\nr(__filename).helper();\n'],
    ['require.call', 'require.call(null, __filename).helper();\n'],
    ['require.cache with a computed key', "require.cache[__filename]['exp' + 'orts'].helper();\n"],
    [
      'the values of require.cache',
      'Object.values(require.cache[__filename]).forEach(v => v && v.helper && v.helper());\n',
    ],
    ['the require of a cached module', 'require.cache[__filename].require(__filename).helper();\n'],
  ])('is checked in full for a property write and %s when the module loads', (_, read) => {
    expect(loadedOf(`${form1}${read}`)).toEqual(['node:fs.stat']);
  });
});
