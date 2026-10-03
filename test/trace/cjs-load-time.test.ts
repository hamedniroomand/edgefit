import { describe, expect, it } from 'vite-plus/test';

import { entry, reached } from './reached.ts';
import type { Source } from './reached.ts';

const fs = "const fs = require('node:fs');\n";

const cjs = (code: string, imports?: Record<string, string>): Source => ({
  code: `${fs}${code}`,
  ...(imports === undefined ? {} : { imports }),
});

const use = (name: string): Source =>
  entry(`import { ${name} } from './lib.js';\n${name}();`, { './lib.js': 'lib.js' });

const used = "exports.used = function () {\n  return fs.watch('.');\n};\n";
const dead = "exports.dead = function () {\n  return fs.watchFile('.');\n};\n";

describe('exports.__defineGetter__', () => {
  it('reads each getter as an export that waits to be used', () => {
    const lib = cjs(
      "exports.__defineGetter__('used', () => fs.watch('.'));\nexports.__defineGetter__('dead', () => fs.watchFile('.'));",
    );
    expect(reached({ 'index.js': use('used'), 'lib.js': lib })['lib.js']).toEqual([
      'node:fs.watch',
    ]);
  });

  it('keeps the module in full for a getter that is not a function', () => {
    const lib = cjs(`${used}${dead}exports.__defineGetter__('other', getter);`);
    expect(reached({ 'index.js': use('used'), 'lib.js': lib })['lib.js']).toEqual([
      'node:fs.watch',
      'node:fs.watchFile',
    ]);
  });
});

describe('an export that is computed when the module loads', () => {
  it('counts what the value uses, and still drops a function that nothing uses', () => {
    const lib = cjs(`${used}${dead}exports.stats = fs.stat('.');`);
    expect(reached({ 'index.js': use('used'), 'lib.js': lib })['lib.js']).toEqual([
      'node:fs.watch',
      'node:fs.stat',
    ]);
  });

  it('reads exports.name = object.name as an export when nothing replaces exports', () => {
    const lib = cjs(`${used}${dead}exports.watchFile = fs.watchFile;`);
    expect(new Set(reached({ 'index.js': use('used'), 'lib.js': lib })['lib.js'])).toEqual(
      new Set(['node:fs.watch', 'node:fs.watchFile']),
    );
  });

  it('reads exports.b = exports.a as the same export under another name', () => {
    const lib = cjs(`${used}${dead}exports.alias = exports.dead;`);
    expect(reached({ 'index.js': use('alias'), 'lib.js': lib })['lib.js']).toEqual([
      'node:fs.watchFile',
    ]);
  });
});

const dep = cjs(`${used}${dead}`);

describe('a require inside a function', () => {
  const lazy = (code: string): Source =>
    cjs(`${used}exports.lazy = function () {\n  ${code}\n};`, {
      'require-call:./dep.js': 'dep.js',
    });

  it('asks for its module only when the function is used', () => {
    const lib = lazy("const dep = require('./dep.js');\n  return dep.used();");
    const found = reached({ 'index.js': use('used'), 'lib.js': lib, 'dep.js': dep });
    expect(found['dep.js']).toEqual([]);
    const asked = reached({ 'index.js': use('lazy'), 'lib.js': lib, 'dep.js': dep });
    expect(asked['dep.js']).toEqual(['node:fs.watch']);
  });

  it('asks for the names that it destructures', () => {
    const lib = lazy("const { dead } = require('./dep.js');\n  return dead();");
    const found = reached({ 'index.js': use('lazy'), 'lib.js': lib, 'dep.js': dep });
    expect(found['dep.js']).toEqual(['node:fs.watchFile']);
  });

  it('asks for all of the module when the name is used as a whole', () => {
    const lib = lazy("const dep = require('./dep.js');\n  return dep;");
    const found = reached({ 'index.js': use('lazy'), 'lib.js': lib, 'dep.js': dep });
    expect(found['dep.js']).toEqual(['node:fs.watch', 'node:fs.watchFile']);
  });

  it('keeps the module read in full when one name stands for two modules', () => {
    const lib = cjs(
      `${used}exports.one = function () {\n  const dep = require('./dep.js');\n  return dep.used();\n};\nexports.two = function () {\n  const dep = require('./other.js');\n  return dep;\n};`,
      { 'require-call:./dep.js': 'dep.js', 'require-call:./other.js': 'other.js' },
    );
    const found = reached({
      'index.js': use('used'),
      'lib.js': lib,
      'dep.js': dep,
      'other.js': cjs(''),
    });
    expect(found['dep.js']).toEqual(['node:fs.watch', 'node:fs.watchFile']);
  });
});

describe('a require inside a function that is not read', () => {
  const both = ['node:fs.watch', 'node:fs.watchFile'];
  const files = (code: string, top = '', entryName = 'used'): Record<string, Source> => ({
    'index.js': use(entryName),
    'lib.js': cjs(`${top}${used}exports.lazy = function () {\n  ${code}\n};`, {
      'require-call:./dep.js': 'dep.js',
    }),
    'dep.js': dep,
  });

  it.each([
    ['an array pattern', "const [first] = require('./dep.js');\n  return first;"],
    [
      'a pattern with a rest element',
      "const { used, ...rest } = require('./dep.js');\n  return rest;",
    ],
  ])('keeps the module in full for %s', (_name, code) => {
    expect(reached(files(code))['dep.js']).toEqual(both);
  });

  it('keeps the module in full when a top-level name is for another module', () => {
    const found = reached(
      files(
        "const dep = require('./dep.js');\n  return dep.used();",
        "const dep = require('./other.js');\n",
      ),
    );
    expect(found['dep.js']).toEqual(both);
  });

  it('reads the nested name when a top-level name is for the same module', () => {
    const found = reached(
      files(
        "const dep = require('./dep.js');\n  return dep.used();",
        "const dep = require('./dep.js');\n",
        'lazy',
      ),
    );
    expect(found['dep.js']).toEqual(['node:fs.watch']);
  });
});

describe('a module that sets its exports to a function or a class that is declared in it', () => {
  const server = cjs(
    "class Server {\n  run() {\n    return fs.watch('.');\n  }\n}\nmodule.exports = Server;",
  );

  it('keeps it once anything is asked of the module', () => {
    const found = reached({
      'index.js': entry("import Server from './lib.js';\nnew Server();", { './lib.js': 'lib.js' }),
      'lib.js': server,
    });
    expect(found['lib.js']).toEqual(['node:fs.watch']);
  });

  it('leaves it out when nothing is asked of the module', () => {
    const found = reached({
      'index.js': entry("import './lib.js';", { './lib.js': 'lib.js' }),
      'lib.js': server,
    });
    expect(found['lib.js']).toEqual([]);
  });

  it('keeps the module in full when another statement names the function', () => {
    const lib = cjs(
      "function run() {\n  return fs.watch('.');\n}\nrun.extra = fs.watchFile;\nmodule.exports = run;",
    );
    const found = reached({
      'index.js': entry("import './lib.js';", { './lib.js': 'lib.js' }),
      'lib.js': lib,
    });
    expect(found['lib.js']).toContain('node:fs.watch');
  });
});
