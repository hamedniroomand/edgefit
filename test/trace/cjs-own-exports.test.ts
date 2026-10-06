import { describe, expect, it } from 'vite-plus/test';

import { build, entry, reached } from './reached.ts';
import type { Source } from './reached.ts';

const fs = "const fs = require('node:fs');\n";
const cjs = (code: string, imports?: Record<string, string>): Source => ({
  code: `${fs}${code}`,
  ...(imports === undefined ? {} : { imports }),
});
const useUsed = entry("import { used } from './lib.js';\nused();", { './lib.js': 'lib.js' });
const dead = "exports.dead = function () {\n  return fs.watchFile('.');\n};\n";
const helper = "exports.helper = function () {\n  return fs.stat('.');\n};\n";
const usedReturns = (code: string): string =>
  `exports.used = function () {\n  return ${code};\n};\n${helper}${dead}`;

function libOf(code: string, others: Record<string, Source> = {}): Record<string, string[]> {
  return reached({ 'index.js': useUsed, 'lib.js': cjs(code), ...others });
}

describe('a CommonJS module that reads its own exports', () => {
  it.each(['module.exports.helper()', 'typeof exports.helper', 'wrap(module.exports.helper)'])(
    'follows the read %s to that export',
    code => {
      expect(libOf(usedReturns(code))['lib.js']).toEqual(['node:fs.stat']);
    },
  );

  it('follows a read of an export that comes from a required module', () => {
    const code = `exports.dep = require('./dep.js').dep;\nexports.used = function () {\n  return module.exports.dep();\n};\n${dead}`;
    const others = {
      'lib.js': cjs(code, { 'require-call:./dep.js': 'dep.js' }),
      'dep.js': cjs(
        "exports.dep = function () {\n  return fs.watch('.');\n};\nexports.other = function () {\n  return fs.stat('.');\n};",
      ),
    };
    expect(libOf(code, others)['dep.js']).toEqual(['node:fs.watch']);
  });

  it('follows a read of a member of the class that module.exports is set to', () => {
    const lib = cjs(
      "const Agent = require('./agent.js');\nexports.used = function () {\n  return 1;\n};",
      { 'require-call:./agent.js': 'agent.js' },
    );
    const agent = cjs(
      "class Agent {\n  run() {\n    fs.watch('.');\n    return module.exports.helper();\n  }\n}\nfs.stat('.');\nmodule.exports = Agent;",
    );
    expect(libOf('', { 'lib.js': lib, 'agent.js': agent })['agent.js']).toEqual(['node:fs.stat']);
  });
});

describe('a CommonJS module whose own exports are read in a way that cannot be told apart', () => {
  it.each([
    'module.exports',
    'Object.keys(exports)',
    'module.exports.missing',
    '(module.exports.helper = null)',
    'delete module.exports.helper',
    'module.exports.count++',
  ])('is checked in full when code uses %s', code => {
    expect(libOf(usedReturns(code))['lib.js']).toEqual(['node:fs.stat', 'node:fs.watchFile']);
  });
});

describe('a CommonJS module that writes into an export when it loads', () => {
  const stores =
    "exports.used = function () {\n  return fs.watch('.');\n};\nexports.stores = {};\n";

  it('counts the write with that export', () => {
    const code = `${stores}module.exports.stores.run = function () {\n  return fs.stat('.');\n};\n${dead}`;
    expect(libOf(code)['lib.js']).toEqual(['node:fs.watch']);
  });

  it('counts the write when the module loads, when its value runs code', () => {
    const code = `${stores}module.exports.stores.run = make(function () {\n  return fs.stat('.');\n});\n${dead}`;
    expect(libOf(code)['lib.js']).toEqual(['node:fs.watch', 'node:fs.stat']);
  });
});

describe('a class with computed method names', () => {
  const classWith = (key: string): string =>
    `const k = Symbol('k');\nexports.used = function () {\n  return fs.watch('.');\n};\nclass Dead {\n  [${key}]() {\n    return fs.watchFile('.');\n  }\n}\nexports.Dead = Dead;`;

  it.each(['k', 'Symbol.iterator'])(
    'drops the class with the key [%s] when nothing uses it',
    key => {
      expect(libOf(classWith(key))['lib.js']).toEqual(['node:fs.watch']);
    },
  );

  it.each(['make()', '`${k}`'])('keeps the class with the key [%s], which runs code', key => {
    expect(libOf(classWith(key))['lib.js']).toEqual(['node:fs.watch', 'node:fs.watchFile']);
  });

  it('keeps the name of a computed key among what the class mentions', () => {
    const { shape } =
      build({ 'lib.js': { code: classWith('k') } }, 'lib.js').modules.get('lib.js') ?? {};
    const unit = shape?.units.find(item => item.name === 'Dead');
    expect(unit?.mentions.has('k')).toBe(true);
  });
});

describe('a function or a class that module.exports is set to in place', () => {
  const requires = (use: string): Source =>
    cjs(
      `const format = require('./formatter.js');\nexports.used = function () {\n  return 1;\n};\nexports.format = function () {\n  return ${use};\n};`,
      { 'require-call:./formatter.js': 'formatter.js' },
    );

  it('drops a class that nothing asks for', () => {
    const formatter = cjs(
      "fs.stat('.');\nmodule.exports = class Formatter {\n  run() {\n    return fs.watch('.');\n  }\n};",
    );
    const others = { 'lib.js': requires('new format()'), 'formatter.js': formatter };
    expect(libOf('', others)['formatter.js']).toEqual(['node:fs.stat']);
  });

  it('drops a function that nothing asks for', () => {
    const formatter = cjs("module.exports = function () {\n  return fs.watch('.');\n};");
    const others = { 'lib.js': requires('format()'), 'formatter.js': formatter };
    expect(libOf('', others)['formatter.js']).toEqual([]);
  });

  it('is checked in full when module.exports is set to a call', () => {
    const formatter = cjs("module.exports = make(function () {\n  return fs.watch('.');\n});");
    const others = { 'lib.js': requires('format()'), 'formatter.js': formatter };
    expect(libOf('', others)['formatter.js']).toEqual(['node:fs.watch']);
  });
});
