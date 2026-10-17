import { describe, expect, it } from 'vite-plus/test';

import { entry, reached } from './reached.ts';

const fs = "const fs = require('node:fs');\n";
const used = "function used() {\n  return fs.watch('.');\n}\n";
const local = "function local() {\n  return fs.watch('.');\n}\nexports.used = local;\n";
const dead = "exports.dead = function () {\n  return fs.watchFile('.');\n};\n";
const both = ['node:fs.watch', 'node:fs.watchFile'];
const other = (body: string): string => `exports.other = function () {\n  ${body}\n};\n`;

/** The API usages that `lib.js` keeps when a CommonJS entry binds it and calls its export `name` as a method. */
function calledOf(code: string, name = 'other'): string[] | undefined {
  return reached({
    'index.js': {
      code: `const lib = require('./lib.js');\nlib.${name}();`,
      imports: { 'require-call:./lib.js': 'lib.js' },
    },
    'lib.js': { code: `${fs}${code}` },
  })['lib.js'];
}

/** The API usages that `lib.js` keeps when the entry only loads it. */
function loadedOf(code: string): string[] | undefined {
  return reached({
    'index.js': entry("import './lib.js';", { './lib.js': 'lib.js' }),
    'lib.js': { code: `${fs}${code}` },
  })['lib.js'];
}

describe('a CommonJS export that reads another export through this', () => {
  it.each([
    ['a computed key', `${used}exports.used = used;\n${other("return this['used']();")}`],
    ['a local name that is not the export name', `${local}${other('return this.used();')}`],
    ['the same local name', `${used}exports.used = used;\n${other('return this.used();')}`],
    ['an arrow in the export', `${local}${other('return [1].map(() => this.used());')}`],
  ])('keeps the export that %s names', (_, code) => {
    expect(calledOf(`${code}${dead}`)).toEqual(['node:fs.watch']);
  });

  it('keeps the export that a method of the exported object names', () => {
    const code =
      "function local() {\n  return fs.watch('.');\n}\nmodule.exports = {\n  used: local,\n  other() {\n    return this.used();\n  },\n  dead() {\n    return fs.watchFile('.');\n  },\n};\n";
    expect(calledOf(code)).toEqual(['node:fs.watch']);
  });

  it('keeps the export that this names at the top level', () => {
    expect(loadedOf(`${local}this.used();\n${dead}`)).toEqual(['node:fs.watch']);
  });

  it.each([
    ['an alias of this', 'const self = this;\n  return self.used();'],
    ['a key that is not a literal', "const key = 'used';\n  return this[key]();"],
    ['this passed on', 'return call(this);'],
  ])('keeps every export for %s', (_, body) => {
    expect(calledOf(`${local}${other(body)}${dead}`)).toEqual(both);
  });
});

describe('a CommonJS module that uses this in a way that cannot be the exports', () => {
  it.each([
    ['a missing export', other('return this.missing();')],
    ['a nested function', other('return [1].map(function () {\n    return this.used();\n  });')],
    ['a class method', 'exports.other = class {\n  run() {\n    return this.used();\n  }\n};\n'],
  ])('keeps no other export for %s', (_, code) => {
    expect(calledOf(`${local}${code}${dead}`)).toEqual([]);
  });

  it.each(['typeof this;', 'if (this) {\n}', 'this === undefined;', '!this;', 'this ? 1 : 2;'])(
    'keeps no export for the test %s',
    test => {
      expect(loadedOf(`${local}${test}\n${dead}`)).toEqual([]);
    },
  );

  it('keeps every export when a value of this can escape through ||', () => {
    expect(loadedOf(`${local}const self = this || {};\nself.used();\n${dead}`)).toEqual(both);
  });

  it('keeps no export for the helpers that tsc emits', () => {
    const helpers =
      'var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {\n    if (k2 === undefined) k2 = k;\n    var desc = Object.getOwnPropertyDescriptor(m, k);\n    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {\n      desc = { enumerable: true, get: function() { return m[k]; } };\n    }\n    Object.defineProperty(o, k2, desc);\n}) : (function(o, m, k, k2) {\n    if (k2 === undefined) k2 = k;\n    o[k2] = m[k];\n}));\nvar __exportStar = (this && this.__exportStar) || function(m, exports) {\n    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);\n};\nvar __importDefault = (this && this.__importDefault) || function (mod) {\n    return (mod && mod.__esModule) ? mod : { "default": mod };\n};\nObject.defineProperty(exports, "__esModule", { value: true });\n';
    expect(
      calledOf(`"use strict";\n${helpers}${used}exports.used = used;\n${dead}`, 'used'),
    ).toEqual(['node:fs.watch']);
  });
});

describe('a CommonJS module with more forms of this', () => {
  it('keeps the export that this names in a write into an export', () => {
    expect(
      loadedOf(
        `exports.used = function () {};\n${dead}exports.spare = function () {\n  return fs.stat('.');\n};\nexports.used.extra = this.dead;\n`,
      ),
    ).toEqual(['node:fs.watchFile']);
  });

  it.each([
    ['instanceof', 'if (!(this instanceof Box)) {\n    return new Box();\n  }'],
    ['in', "return 'used' in this;"],
    ['void', 'return void this;'],
  ])('keeps no other export for the test %s', (_, body) => {
    const box = `function Box() {\n  ${body}\n}\nexports.Box = Box;\n`;
    expect(calledOf(`${local}${box}${dead}`, 'Box')).toEqual([]);
  });

  it('keeps no other export for the __assign helper that tsc emits', () => {
    const assign =
      'var __assign = (this && this.__assign) || function () {\n    __assign = Object.assign || function(t) {\n        for (var s, i = 1, n = arguments.length; i < n; i++) {\n            s = arguments[i];\n            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))\n                t[p] = s[p];\n        }\n        return t;\n    };\n    return __assign.apply(this, arguments);\n};\n';
    const usedSpread =
      "function used(o) {\n  fs.watch('.');\n  return __assign({}, o);\n}\nexports.used = used;\n";
    expect(calledOf(`${assign}${usedSpread}${dead}`, 'used')).toEqual(['node:fs.watch']);
  });
});

describe('a CommonJS module that reads this and another module', () => {
  it('reads a key with a dot as any use of this, and the module stays read by export', () => {
    const spare = "function spare() {\n  return fs.stat('.');\n}\n";
    const dotted = "Object.defineProperty(exports, 'a.b', {\n  get() {\n    return 1;\n  }\n});\n";
    expect(calledOf(`${spare}${dotted}${other("return this['a.b'];")}`)).toEqual([]);
  });

  it('asks a star module for what this reads that is not an own export', () => {
    const files = {
      'index.js': {
        code: "const lib = require('./lib.js');\nlib.other();",
        imports: { 'require-call:./lib.js': 'lib.js' },
      },
      'lib.js': {
        code: `var __exportStar = function (m, exports) {\n  for (var p in m) exports[p] = m[p];\n};\n__exportStar(require('./b.js'), exports);\n${other('return this.fromB();')}`,
        imports: { 'require-call:./b.js': 'b.js' },
      },
      'b.js': { code: `${fs}exports.fromB = function () {\n  return fs.watch('.');\n};\n` },
    };
    expect(reached(files)['b.js']).toContain('node:fs.watch');
  });
});

describe('a CommonJS module that tsc compiled from async functions', () => {
  const awaiter =
    'var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {\n    return new (P || (P = Promise))(function (resolve, reject) {\n        function step(result) { result.done ? resolve(result.value) : step(generator.next(result.value)); }\n        step((generator = generator.apply(thisArg, _arguments || [])).next());\n    });\n};\n';
  const usedOf = (call: string): string =>
    `function used() {\n    return ${call}(this, void 0, void 0, function* () {\n        fs.watch('.');\n    });\n}\nexports.used = used;\n`;

  it.each([
    ['__awaiter', `${awaiter}${usedOf('__awaiter')}`],
    ['a member __awaiter', `const tslib_1 = require('tslib');\n${usedOf('tslib_1.__awaiter')}`],
    ['__generator', `${usedOf('__generator')}`],
  ])('keeps no other export for this passed to %s', (_, code) => {
    expect(calledOf(`${code}${dead}`, 'used')).toEqual(['node:fs.watch']);
  });

  it('keeps every export for this passed to __awaiter in another place', () => {
    const late =
      "function used() {\n  fs.watch('.');\n  return __awaiter(void 0, this);\n}\nexports.used = used;\n";
    expect(calledOf(`${awaiter}${late}${dead}`, 'used')).toEqual(both);
  });
});

describe('code that uses this in a way that edgefit does not read as the exports', () => {
  it('keeps no other export for this in JSX in an ES module class', () => {
    const lib =
      "import fs from 'node:fs';\nexport function used() {\n  return fs.watch('.');\n}\nexport class Other {\n  render() {\n    return <this.props.Comp />;\n  }\n}\nexport function dead() {\n  return fs.watchFile('.');\n}\n";
    const files = {
      'index.js': entry("import { Other } from './lib.jsx';\nnew Other().render();", {
        './lib.jsx': 'lib.jsx',
      }),
      'lib.jsx': { code: lib },
    };
    expect(reached(files)['lib.jsx']).toEqual([]);
  });

  it.each([
    ['without a test of this', 'var used = this.used || null;'],
    ['in a function', 'var used = (this && this.used) || null;'],
  ])('keeps the export that this names in a fallback %s', (_, fallback) => {
    expect(calledOf(`${local}${other(`${fallback}\n  return used();`)}${dead}`)).toEqual([
      'node:fs.watch',
    ]);
  });

  it('keeps the export that this names in a top-level fallback that tests another value', () => {
    expect(loadedOf(`${local}var used = (flag && this.used) || null;\n${dead}`)).toEqual([
      'node:fs.watch',
    ]);
  });
});

describe('a CommonJS module that Babel or SWC compiled from async functions', () => {
  const helper = (name: string): string =>
    `function ${name}(fn) {\n  return function () {\n    var self = this, args = arguments;\n    return new Promise(function (resolve) {\n      resolve(fn.apply(self, args).next());\n    });\n  };\n}\n`;
  const asyncUsed = (name: string): string =>
    `function used() {\n  return _used.apply(this, arguments);\n}\nfunction _used() {\n  _used = ${name}(function* () {\n    fs.watch('.');\n  });\n  return _used.apply(this, arguments);\n}\nexports.used = used;\n`;

  it.each(['_asyncToGenerator', '_async_to_generator'])(
    'keeps no other export for this passed on with apply after %s',
    name => {
      expect(calledOf(`${helper(name)}${asyncUsed(name)}${dead}`, 'used')).toEqual([
        'node:fs.watch',
      ]);
    },
  );

  it('keeps no other export for this passed on with call', () => {
    const code = `${local}exports.other = function () {\n  return run.call(this);\n};\nfunction run() {\n  return 1;\n}\n`;
    expect(calledOf(`${code}${dead}`)).toEqual([]);
  });

  it('keeps every export for this passed on with apply of a member', () => {
    expect(calledOf(`${local}${other('return obj.x.apply(this, arguments);')}${dead}`)).toEqual(
      both,
    );
  });
});

describe('a CommonJS function that uses this and is not an export', () => {
  it.each([
    [
      'a prototype method that returns this',
      'function Foo() {}\nFoo.prototype.run = function () {\n  return this;\n};\nexports.Foo = Foo;\n',
      'Foo',
    ],
    [
      'a helper that keeps this in a name',
      'function helper() {\n  var self = this;\n  return self;\n}\nexports.Foo = function () {\n  return helper();\n};\n',
      'Foo',
    ],
    [
      'a constructor that passes this to its base',
      'function Base() {}\nfunction Foo() {\n  Base.call(this);\n}\nexports.Foo = Foo;\n',
      'Foo',
    ],
  ])('keeps no other export for %s', (_, code, name) => {
    expect(calledOf(`${local}${code}${dead}`, name)).toEqual([]);
  });
});
