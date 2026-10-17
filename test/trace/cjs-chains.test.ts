import { describe, expect, it } from 'vite-plus/test';

import { both, dead, fs, libOf, loadedOf, used } from './cjs-lib.ts';
import { entry, reached } from './reached.ts';

describe('a CommonJS module that sets module.exports and then writes a property of it', () => {
  const request = "function request() {\n  return fs.watch('.');\n}\n";
  const handler = "class Handler {\n  run() {\n    return fs.stat('.');\n  }\n}\n";
  const code = `${request}${handler}${dead}module.exports = request;\nmodule.exports.Handler = Handler;\nmodule.exports.dead = dead;\n`;
  const inline = `${request}module.exports = request;\nmodule.exports.dead = function () {\n  return fs.watchFile('.');\n};\n`;

  it('keeps the value of module.exports and each property of it when an export is asked', () => {
    expect(libOf(code, 'Handler')).toEqual(['node:fs.watch', 'node:fs.stat', 'node:fs.watchFile']);
    expect(libOf(inline, 'dead')).toEqual(both);
  });

  it.each([
    ['named properties', code],
    ['a function property', inline],
  ])('keeps nothing of %s when the module is only loaded', (_, lib) => {
    expect(loadedOf(lib)).toEqual([]);
  });
});

describe('a CommonJS module whose module.exports value can reach the properties of it', () => {
  const helper = "module.exports.helper = function () {\n  return fs.stat('.');\n};\n";
  const exported = (body: string, after = ''): string =>
    `function request() {\n  ${body}\n}\nmodule.exports = request;\n${helper}module.exports.other = 1;\n${after}`;
  const run = (read: string): string =>
    exported('return 1;', `module.exports.run = function () {\n  return ${read};\n};\n`);

  it.each([
    ['a read through the name', exported('return request.helper();')],
    ['a copy of the name', exported('const r = request;\n  return r.helper();')],
    ['a computed read', exported("return request['helper']();")],
    ['a call that takes the value', exported('return call(request);')],
    ['this in the value', exported('return this.helper();')],
  ])('keeps the properties for %s', (_, code) => {
    expect(libOf(code, 'other')).toEqual(['node:fs.stat']);
  });

  it.each(['this.helper()', 'module.exports.helper()'])(
    'keeps the properties for %s in another property',
    read => {
      expect(libOf(run(read), 'run')).toEqual(['node:fs.stat']);
    },
  );

  it('keeps the properties for exports.helper() after exports = module.exports = request', () => {
    const code = `${exported('return 1;')}`.replace(
      'module.exports = request;',
      'exports = module.exports = request;',
    );
    const reader = 'module.exports.run = function () {\n  return exports.helper();\n};\n';
    expect(libOf(`${code}${reader}`, 'run')).toEqual(['node:fs.stat']);
  });

  it.each([
    ['a property', 'module.exports.helper();\n'],
    ['a property that reads another through this', 'module.exports.run();\n'],
  ])('keeps the properties for a read of %s when the module loads', (_, call) => {
    expect(loadedOf(`${run('this.helper()')}${call}`)).toEqual(['node:fs.stat']);
  });

  it('asks all of a required module that a property holds', () => {
    const lib = `function request() {\n  return this.dep.watch();\n}\nmodule.exports = request;\nmodule.exports.dep = require('./dep.js');\nmodule.exports.other = 1;\n`;
    const files = {
      'index.js': entry("import { other } from './lib.js';\nother;", { './lib.js': 'lib.js' }),
      'lib.js': { code: lib, imports: { 'require-call:./dep.js': 'dep.js' } },
      'dep.js': { code: `${fs}exports.watch = function () {\n  return fs.watch('.');\n};\n` },
    };
    expect(reached(files)['dep.js']).toEqual(['node:fs.watch']);
  });
});

describe('a CommonJS module that sets module.exports and exports in one chain', () => {
  it.each([
    ['module.exports = exports = { used, dead }', 'module.exports = { used, dead }'],
    ['exports = module.exports = { used, dead }', 'module.exports = { used, dead }'],
    [
      'const api = { used, dead };\nmodule.exports = exports = api',
      'const api = { used, dead };\nmodule.exports = api',
    ],
    ['module.exports = exports = used', 'module.exports = used'],
  ])('reads %s as %s', (chain, single) => {
    expect(libOf(`${used}${dead}${single};\n`)).toEqual(['node:fs.watch']);
    expect(libOf(`${used}${dead}${chain};\n`)).toEqual(libOf(`${used}${dead}${single};\n`));
  });

  it('reads a copy of a property of the object that module.exports is set to', () => {
    const copy =
      'const api = { used, dead };\nmodule.exports = api;\nmodule.exports.used = api.used;\n';
    expect(libOf(`${used}${dead}${copy}`)).toEqual(['node:fs.watch']);
  });
});

describe('a CommonJS module that keeps an export in a local name too', () => {
  const body = "function () {\n  return fs.watch('.');\n}";
  const deadExport = "exports.dead = function () {\n  return fs.watchFile('.');\n};\n";
  const caller = 'exports.run = function () {\n  return used();\n};\n';
  const named = `function used() {\n  return fs.watch('.');\n}\nexports.used = used;\n`;

  it.each([
    ['a const', `const used = exports.used = ${body};\n`],
    ['a statement', `let used;\nused = exports.used = ${body};\n`],
    ['module.exports', `const used = module.exports.used = ${body};\n`],
  ])('reads the form with %s as a named function', (_, code) => {
    expect(libOf(`${named}${deadExport}`)).toEqual(['node:fs.watch']);
    expect(libOf(`${code}${deadExport}`)).toEqual(libOf(`${named}${deadExport}`));
    expect(libOf(`${code}${caller}${deadExport}`, 'run')).toEqual(
      libOf(`${named}${caller}${deadExport}`, 'run'),
    );
  });

  it('reads a lazy class as a named class', () => {
    const lazy = "class {\n  run() {\n    return fs.watch('.');\n  }\n}";
    expect(libOf(`const used = exports.used = ${lazy};\n${deadExport}`)).toEqual(['node:fs.watch']);
  });

  it('keeps what the local name holds after a later write', () => {
    const other = "function other() {\n  return fs.stat('.');\n}\n";
    const code = `${other}let used;\nused = exports.used = ${body};\nused = other;\n${caller}${deadExport}`;
    expect(libOf(code, 'run')).toEqual(['node:fs.stat', 'node:fs.watch']);
  });
});

describe('a CommonJS module whose chained writes cannot be read', () => {
  const exported = `${used}${dead}`;

  it.each([
    ['exports.name after a whole write', 'module.exports = { used };\nexports.dead = dead;'],
    ['a whole write of exports alone', 'exports = { used, dead };'],
    ['a chain through another name', 'let other;\nmodule.exports = other = { used, dead };'],
    [
      'a local name that holds a value',
      'exports.used = used;\nexports.dead = dead;\nconst value = exports.value = make();',
    ],
    [
      'a local name that is exports',
      'exports.used = used;\nexports.dead = dead;\nexports = exports.other = function () {};',
    ],
    [
      'a local name that a helper of a compiler uses',
      'exports.used = used;\nexports.dead = dead;\nvar __importStar = exports.__importStar = function () {\n  return module.exports;\n};',
    ],
  ])('is checked in full for %s', (_, code) => {
    expect(libOf(`${exported}${code}\n`)).toEqual(both);
  });

  it('is checked in full for exports.name after a whole write of a name', () => {
    expect(loadedOf(`${exported}module.exports = used;\nexports.dead = dead;\n`)).toEqual(both);
  });
});

describe('a CommonJS module whose property writes cannot be read', () => {
  it.each([
    [
      'a property write after a second whole write',
      'module.exports = { used };\nmodule.exports = { dead };\nmodule.exports.used = used;',
    ],
    [
      'a local name of exports.name after a whole write',
      'module.exports = { used };\nconst other = exports.other = function () {\n  return dead();\n};',
    ],
    [
      'a second write of a property export after a whole write',
      'module.exports = used;\nmodule.exports.dead = dead;\nmodule.exports.dead();\nmodule.exports.dead = used;',
    ],
    [
      'a property write after a whole write of an object',
      'module.exports = {\n  used,\n  run() {\n    return this.dead();\n  },\n};\nmodule.exports.dead = dead;',
    ],
    [
      'a property write after a whole write of an object name',
      'const api = { used };\nmodule.exports = api;\nmodule.exports.dead = dead;',
    ],
    [
      'a property write after a chain to an object name',
      'const api = { used };\nmodule.exports = exports = api;\nmodule.exports.dead = dead;',
    ],
    [
      'a property write after a reversed chain to an object name',
      'const api = { used };\nexports = module.exports = api;\nmodule.exports.dead = dead;',
    ],
    [
      'a property write before the whole write',
      'module.exports.dead = dead;\nmodule.exports = used;',
    ],
  ])('is checked in full for %s', (_, code) => {
    expect(libOf(`${used}${dead}${code}\n`)).toEqual(both);
  });
});

describe('a CommonJS module that sets module.exports to a required module and writes a property of it', () => {
  it.each([
    ['a binding', "const dep = require('./dep.js');\nmodule.exports = dep;"],
    ['a destructured name', "const { inner } = require('./dep.js');\nmodule.exports = inner;"],
  ])('is checked in full for %s, because other modules can read the property', (_, whole) => {
    const run = "module.exports.run = function () {\n  return fs.stat('.');\n};\n";
    const required = { 'require-call:./dep.js': 'dep.js' };
    const files = {
      'index.js': {
        code: "require('./lib.js');\nrequire('./dep.js').run();",
        imports: { 'require-call:./lib.js': 'lib.js', ...required },
      },
      'lib.js': { code: `${fs}${whole}\n${run}`, imports: required },
      'dep.js': { code: 'exports.x = 1;\nexports.inner = {};\n' },
    };
    expect(reached(files)['lib.js']).toEqual(['node:fs.stat']);
  });
});
