import { describe, expect, it } from 'vite-plus/test';

import { entry, reached } from './reached.ts';
import type { Source } from './reached.ts';

const fs = "const fs = require('node:fs');\n";
const exportHelper =
  'function _export(target, all) {\n  for (var name in all) Object.defineProperty(target, name, { enumerable: true, get: all[name] });\n}\n';

const cjs = (code: string, imports?: Record<string, string>): Source => ({
  code: `${fs}${code}`,
  ...(imports === undefined ? {} : { imports }),
});

const dependency = cjs(
  `exports.used = function () {\n  return fs.watch('.');\n};\nexports.dead = function () {\n  return fs.watchFile('.');\n};`,
);

const useUsed = (path: string): Source =>
  entry(`import { used } from '${path}';\nused();`, { [path]: path.slice(2) });

const files = (code: string): Record<string, Source> => ({
  'index.js': useUsed('./lib.js'),
  'lib.js': cjs(`${exportHelper}${code}`, { 'require-call:./dep.js': 'dep.js' }),
  'dep.js': dependency,
});

const read = (code: string): string[] | undefined =>
  reached(
    files(`${code}\n_export(exports, {\n  used: function () {\n    return _dep.used;\n  }\n});`),
  )['dep.js'];
const used = ['node:fs.watch'];
const all = ['node:fs.watch', 'node:fs.watchFile'];
const swc = (name: string): string => `const _${name} = require('@swc/helpers/_/_${name}');\n`;

/** The helpers as tsc 5 emits them. */
const tsc = {
  createBinding:
    'var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {\n    if (k2 === undefined) k2 = k;\n    var desc = Object.getOwnPropertyDescriptor(m, k);\n    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {\n      desc = { enumerable: true, get: function() { return m[k]; } };\n    }\n    Object.defineProperty(o, k2, desc);\n}) : (function(o, m, k, k2) {\n    if (k2 === undefined) k2 = k;\n    o[k2] = m[k];\n}));\n',
  exportStar:
    'var __exportStar = (this && this.__exportStar) || function(m, exports) {\n    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);\n};\n',
  importStar:
    'var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {\n    Object.defineProperty(o, "default", { enumerable: true, value: v });\n}) : function(o, v) {\n    o["default"] = v;\n});\nvar __importStar = (this && this.__importStar) || (function () {\n    var ownKeys = function(o) {\n        ownKeys = Object.getOwnPropertyNames || function (o) {\n            var ar = [];\n            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;\n            return ar;\n        };\n        return ownKeys(o);\n    };\n    return function (mod) {\n        if (mod && mod.__esModule) return mod;\n        var result = {};\n        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);\n        __setModuleDefault(result, mod);\n        return result;\n    };\n})();\n',
  importDefault:
    'var __importDefault = (this && this.__importDefault) || function (mod) {\n    return (mod && mod.__esModule) ? mod : { "default": mod };\n};\n',
};

const star = (code: string): string[] | undefined =>
  reached({
    'index.js': useUsed('./lib.js'),
    'lib.js': cjs(code, { 'require-call:./dep.js': 'dep.js' }),
    'dep.js': dependency,
  })['dep.js'];

describe('what a CommonJS module asks of a module it requires through an @swc/helpers module', () => {
  it('reads through a member of an @swc/helpers module', () => {
    expect(
      read(
        `${swc('interop_require_wildcard')}const _dep = _interop_require_wildcard._(require('./dep.js'));`,
      ),
    ).toEqual(used);
  });

  it('reads the export star helper of @swc/helpers', () => {
    expect(star(`${swc('export_star')}_export_star._(require('./dep.js'), exports);`)).toEqual(
      used,
    );
  });

  it('asks for everything through a lookalike that is not a helper', () => {
    expect(
      read(`const swc = require('./other.js');\nconst _dep = swc._(require('./dep.js'));`),
    ).toEqual(all);
  });
});

describe('what a CommonJS module asks of a module it requires through the helpers of tsc', () => {
  it('reads __importStar and __importDefault', () => {
    expect(
      read(`${tsc.createBinding}${tsc.importStar}const _dep = __importStar(require('./dep.js'));`),
    ).toEqual(used);
    expect(read(`${tsc.importDefault}const _dep = __importDefault(require('./dep.js'));`)).toEqual(
      used,
    );
  });

  it('reads __exportStar', () => {
    const code = `${tsc.createBinding}${tsc.exportStar}__exportStar(require('./dep.js'), exports);`;
    expect(star(code)).toEqual(used);
  });

  it('asks for everything through a fallback that does not read this', () => {
    const lookalike = tsc.importDefault.replace(
      '(this && this.__importDefault)',
      '(this && lib.__importDefault)',
    );
    expect(read(`${lookalike}const _dep = __importDefault(require('./dep.js'));`)).toEqual(all);
  });
});

describe('what a CommonJS module asks of a module it requires through tslib', () => {
  const tslib = "const tslib_1 = require('tslib');\n";

  it('reads __importStar, __importDefault and __exportStar', () => {
    expect(read(`${tslib}const _dep = tslib_1.__importStar(require('./dep.js'));`)).toEqual(used);
    expect(read(`${tslib}const _dep = tslib_1.__importDefault(require('./dep.js'));`)).toEqual(
      used,
    );
    expect(star(`${tslib}tslib_1.__exportStar(require('./dep.js'), exports);`)).toEqual(used);
  });

  it('asks for everything through a lookalike that is not a helper', () => {
    expect(
      read(
        `const lib = require('not-tslib');\nconst _dep = lib.__importStar(require('./dep.js'));`,
      ),
    ).toEqual(all);
    expect(read(`const _dep = tslib_1.__importStar(require('./dep.js'));`)).toEqual(all);
    expect(read(`${tslib}const _dep = tslib_1.__toESM(require('./dep.js'));`)).toEqual(all);
  });
});

describe('what a CommonJS module asks of a module it requires through the helper of older esbuild', () => {
  const toModule = 'var __toModule = (m) => __reExport(__markAsModule({}), m);\n';

  it('reads __toModule', () => {
    expect(read(`${toModule}const _dep = __toModule(require('./dep.js'));`)).toEqual(used);
  });

  it('asks for everything when __toModule is not defined', () => {
    expect(read(`const _dep = __toModule(require('./dep.js'));`)).toEqual(all);
  });
});
