import { describe, expect, it } from 'vite-plus/test';

import { entry, reached } from './reached.ts';
import type { Source } from './reached.ts';

const fs = "const fs = require('node:fs');\n";

/** The helper SWC and TypeScript emit to define getters for the exports. */
const exportHelper =
  'function _export(target, all) {\n  for (var name in all) Object.defineProperty(target, name, { enumerable: true, get: all[name] });\n}\n';

const watchers = (names: string[]): string =>
  names
    .map(
      name =>
        `function ${name}() {\n  return fs.${name === 'used' ? 'watch' : 'watchFile'}('.');\n}\n`,
    )
    .join('');

const cjs = (code: string, imports?: Record<string, string>): Source => ({
  code: `${fs}${code}`,
  ...(imports === undefined ? {} : { imports }),
});

const useUsed = (path = './lib.js'): Source =>
  entry(`import { used } from '${path}';\nused();`, { [path]: path.slice(2) });

describe('the exports of a CommonJS module that are used', () => {
  it('reads getters defined through the helper SWC and TypeScript emit', () => {
    const lib = cjs(
      `${exportHelper}_export(exports, {\n  used: function () {\n    return used;\n  },\n  dead: function () {\n    return dead;\n  }\n});\n${watchers(['used', 'dead'])}`,
    );
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toEqual(['node:fs.watch']);
  });

  it('reads Object.defineProperty with a getter or a value', () => {
    const lib = cjs(
      `Object.defineProperty(exports, '__esModule', { value: true });\nObject.defineProperty(exports, 'used', { enumerable: true, get: function () { return fs.watch('.'); } });\nObject.defineProperty(exports, 'dead', { value: function () { return fs.watchFile('.'); } });`,
    );
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toEqual(['node:fs.watch']);
  });

  it('reads assignments to exports and module.exports', () => {
    const lib = cjs(
      `exports.used = function () {\n  return fs.watch('.');\n};\nmodule.exports.dead = function () {\n  return fs.watchFile('.');\n};`,
    );
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toEqual(['node:fs.watch']);
  });

  it('reads exports that name a function declared in the module', () => {
    const lib = cjs(`exports.used = used;\nexports.dead = dead;\n${watchers(['used', 'dead'])}`);
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toEqual(['node:fs.watch']);
  });
});

describe('more forms of the exports of a CommonJS module', () => {
  it('reads module.exports set to an object literal', () => {
    const lib = cjs(
      `module.exports = { used, dead, other: function () { return fs.watchFile('.'); } };\n${watchers(['used', 'dead'])}`,
    );
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toEqual(['node:fs.watch']);
  });

  it('ignores the exports tsc declares as void 0 before it assigns them', () => {
    const lib = cjs(
      `exports.used = exports.dead = void 0;\nexports.used = used;\nexports.dead = dead;\n${watchers(['used', 'dead'])}`,
    );
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toEqual(['node:fs.watch']);
  });

  it('keeps code that runs when the module loads', () => {
    const lib = cjs(`fs.watchFile('.');\nexports.used = used;\n${watchers(['used'])}`);
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toEqual([
      'node:fs.watchFile',
      'node:fs.watch',
    ]);
  });

  it('gives the whole module to an ES default import of one without an __esModule marker', () => {
    const lib = cjs(`exports.used = used;\nexports.dead = dead;\n${watchers(['used', 'dead'])}`);
    expect(
      reached({
        'index.js': entry("import lib from './lib.js';\nlib.used();", { './lib.js': 'lib.js' }),
        'lib.js': lib,
      })['lib.js'],
    ).toEqual(['node:fs.watch', 'node:fs.watchFile']);
  });
});

const dep = cjs(
  `exports.used = function () {\n  return fs.watch('.');\n};\nexports.dead = function () {\n  return fs.watchFile('.');\n};`,
);
const files = (code: string): Record<string, Source> => ({
  'index.js': useUsed(),
  'lib.js': cjs(`${exportHelper}${code}`, { 'require-call:./dep.js': 'dep.js' }),
  'dep.js': dep,
});

describe('an export that is an object literal', () => {
  it('drops the methods of an object literal export that nothing uses, and keeps what runs when the module loads', () => {
    const lib = cjs(
      "exports.used = function () {\n  return fs.watch('.');\n};\nexports.dead = {\n  run: function () {\n    return fs.watchFile('.');\n  },\n  stat: fs.stat,\n};",
    );
    const found = reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js'] ?? [];
    expect([...new Set(found)].sort()).toEqual(['node:fs.stat', 'node:fs.watch']);
  });

  it.each([
    ['a call', "data: fs.watchFile('.')"],
    ['a static class field', "k: class { static x = fs.watchFile('.'); }"],
    ['a new expression', "s: new (require('node:net').Server)()"],
  ])('counts %s in an object literal export when the module loads', (_name, member) => {
    const lib = cjs(
      `exports.used = function () {\n  return fs.watch('.');\n};\nexports.dead = { ${member} };`,
    );
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toHaveLength(2);
  });

  it('reads an object literal export that has a spread, and still drops its dead method', () => {
    const lib = cjs(
      "const other = {};\nexports.used = function () {\n  return fs.watch('.');\n};\nexports.dead = {\n  ...other,\n  run() {\n    return fs.watchFile('.');\n  },\n};",
    );
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toEqual(['node:fs.watch']);
  });

  it('keeps the members of an export that is an object literal once it is used', () => {
    const lib = cjs(
      "exports.used = {\n  run: function () {\n    return fs.watch('.');\n  },\n};\nexports.dead = function () {\n  return fs.watchFile('.');\n};",
    );
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toEqual(['node:fs.watch']);
  });
});

describe('what a CommonJS module asks of the modules it requires', () => {
  it('asks for the member that is read from a required module', () => {
    const result = reached(
      files(
        "const _dep = require('./dep.js');\n_export(exports, {\n  used: function () {\n    return _dep.used;\n  },\n  dead: function () {\n    return _dep.dead;\n  }\n});",
      ),
    );
    expect(result['dep.js']).toEqual(['node:fs.watch']);
  });

  it('asks for everything when the required module is used as a whole', () => {
    const result = reached(
      files(
        "const _dep = require('./dep.js');\n_export(exports, {\n  used: function () {\n    return use(_dep);\n  }\n});",
      ),
    );
    expect(result['dep.js']).toEqual(['node:fs.watch', 'node:fs.watchFile']);
  });

  it('asks for the names a destructuring takes', () => {
    const result = reached(
      files(
        "const { used: take } = require('./dep.js');\n_export(exports, {\n  used: function () {\n    return take;\n  }\n});",
      ),
    );
    expect(result['dep.js']).toEqual(['node:fs.watch']);
  });
});

describe('what a CommonJS module asks of a module it requires through a wrapper', () => {
  it('reads through the interop wrappers', () => {
    const wrapper =
      'function _interop_require_wildcard(mod) {\n  return mod;\n}\nfunction _interop_require_default(mod) {\n  return { default: mod };\n}\n';
    const result = reached(
      files(
        `${wrapper}const _dep = _interop_require_wildcard(require('./dep.js'));\n_export(exports, {\n  used: function () {\n    return _dep.used;\n  }\n});`,
      ),
    );
    expect(result['dep.js']).toEqual(['node:fs.watch']);
  });

  it('asks for everything when another require of the same module cannot be read', () => {
    const result = reached(
      files(
        "const _dep = require('./dep.js');\n_export(exports, {\n  used: function () {\n    return _dep.used;\n  },\n  other: function () {\n    return require('./dep.js');\n  }\n});",
      ),
    );
    expect(result['dep.js']).toEqual(['node:fs.watch', 'node:fs.watchFile']);
  });

  it('loads a required module without asking for any export', () => {
    const result = reached({
      'index.js': useUsed(),
      'lib.js': cjs(`exports.used = used;\nrequire('./dep.js');\n${watchers(['used'])}`, {
        'require-call:./dep.js': 'dep.js',
      }),
      'dep.js': cjs(
        "fs.watch('.');\nexports.dead = function () {\n  return fs.watchFile('.');\n};",
      ),
    });
    expect(result['dep.js']).toEqual(['node:fs.watch']);
  });
});

const dependency = (name: string, api: string): Source =>
  cjs(
    `exports.${name} = function () {\n  return fs.${api}('.');\n};\nexports.other = function () {\n  return fs.unwatchFile('.');\n};`,
  );
const imports = {
  'require-call:./a.js': 'a.js',
  'require-call:./b.js': 'b.js',
};

describe('a barrel that re-exports what it requires', () => {
  it('asks a module for a property only when the barrel is asked for it', () => {
    const barrel = cjs(
      "const barrel = {\n  used: require('./a.js').used,\n  dead: require('./b.js').dead\n};\nmodule.exports = barrel;\nexports.used = barrel.used;\nexports.dead = barrel.dead;",
      imports,
    );
    const result = reached({
      'index.js': useUsed('./barrel.js'),
      'barrel.js': barrel,
      'a.js': dependency('used', 'watch'),
      'b.js': dependency('dead', 'watchFile'),
    });
    expect(result['a.js']).toEqual(['node:fs.watch']);
    expect(result['b.js']).toEqual([]);
  });

  it('passes the demand through module.exports = require()', () => {
    const result = reached({
      'index.js': useUsed('./barrel.js'),
      'barrel.js': cjs("module.exports = require('./a.js');", {
        'require-call:./a.js': 'a.js',
      }),
      'a.js': cjs(
        `exports.used = function () {\n  return fs.watch('.');\n};\nexports.dead = function () {\n  return fs.watchFile('.');\n};`,
      ),
    });
    expect(result['a.js']).toEqual(['node:fs.watch']);
  });
});

describe('a barrel that passes the demand through a require', () => {
  it('passes the demand through the export star helper', () => {
    const helper =
      'function _export_star(from, to) {\n  Object.keys(from).forEach(function (k) { to[k] = from[k]; });\n  return from;\n}\n';
    const result = reached({
      'index.js': useUsed('./barrel.js'),
      'barrel.js': cjs(`${helper}_export_star(require('./a.js'), exports);`, {
        'require-call:./a.js': 'a.js',
      }),
      'a.js': cjs(
        `exports.used = function () {\n  return fs.watch('.');\n};\nexports.dead = function () {\n  return fs.watchFile('.');\n};`,
      ),
    });
    expect(result['a.js']).toEqual(['node:fs.watch']);
  });
});

describe('a CommonJS module whose exports cannot be read', () => {
  const both = ['node:fs.watch', 'node:fs.watchFile'];

  it('is checked in full when module.exports is a function', () => {
    const lib = cjs(
      "module.exports = function () {\n  return fs.watch('.');\n};\nexports.dead = function () {\n  return fs.watchFile('.');\n};",
    );
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toEqual(both);
  });

  it('is checked in full when an export name is computed', () => {
    const lib = cjs(
      "const name = 'used';\nexports[name] = function () {\n  return fs.watch('.');\n};\nexports.dead = function () {\n  return fs.watchFile('.');\n};",
    );
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toEqual(both);
  });

  it('is checked in full when module.exports and exports are both written', () => {
    const lib = cjs(
      `module.exports = { used };\nexports.dead = dead;\n${watchers(['used', 'dead'])}`,
    );
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toEqual(both);
  });

  it('is checked in full when code reads its own exports', () => {
    const lib = cjs(
      `exports.used = used;\nexports.dead = dead;\nfunction used() {\n  fs.watch('.');\n  return exports.dead();\n}\n${watchers(['dead'])}`,
    );
    expect(reached({ 'index.js': useUsed(), 'lib.js': lib })['lib.js']).toEqual(both);
  });

  it('is checked in full when it is required by a module that uses the whole of it', () => {
    const result = reached({
      'index.js': entry("const lib = require('./lib.js');\nlib.run(lib);", {
        'require-call:./lib.js': 'lib.js',
      }),
      'lib.js': cjs(`exports.used = used;\nexports.dead = dead;\n${watchers(['used', 'dead'])}`),
    });
    expect(result['lib.js']).toEqual(both);
  });
});
