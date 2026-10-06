import { describe, expect, it } from 'vite-plus/test';

import { tagUsagesByExport } from '@/trace/by-export.ts';
import { reachedUsages } from '@/trace/reach.ts';

import { build, entry, lib } from './reached.ts';
import type { Source } from './reached.ts';

const harness = entry("import * as m from './lib.js';\nexport { m };", { './lib.js': 'lib.js' });

/** The exports that reach each API of lib.js, as `undefined` when the usage is not tagged. */
function tagsOf(
  code: Source,
  others: Record<string, Source> = {},
  file = 'lib.js',
): Record<string, string[] | undefined> {
  const { graph, modules } = build({ 'index.js': harness, 'lib.js': code, ...others });
  const tagged = tagUsagesByExport(graph, modules, reachedUsages(graph, modules));
  return Object.fromEntries(
    (tagged.get(file) ?? [])
      .filter(usage => usage.display.includes('.'))
      .map(usage => [usage.display, usage.exports]),
  );
}

const watchers =
  "export function a() {\n  return fs.watch('.');\n}\nexport function b() {\n  return fs.watchFile('.');\n}\n";

describe('the exports that reach a usage', () => {
  it('names the export of a usage that only one export reaches', () => {
    expect(tagsOf(lib(`${watchers}fs.stat('.');`))).toEqual({
      'node:fs.watch': ['a'],
      'node:fs.watchFile': ['b'],
      'node:fs.stat': undefined,
    });
  });

  it('leaves a usage that every export reaches as it is', () => {
    const code = lib(
      "function helper() {\n  return fs.watch('.');\n}\nexport function a() {\n  return helper();\n}\nexport function b() {\n  return helper();\n}\n",
    );
    expect(tagsOf(code)).toEqual({ 'node:fs.watch': undefined });
  });

  it('names an export of a CommonJS module', () => {
    const code: Source = {
      code: "const fs = require('node:fs');\nexports.a = function () {\n  return fs.watch('.');\n};\nexports.b = function () {\n  return fs.watchFile('.');\n};",
    };
    expect(tagsOf(code)).toEqual({ 'node:fs.watch': ['a'], 'node:fs.watchFile': ['b'] });
  });

  it('names the export that uses a name destructured from a require', () => {
    const code: Source = {
      code: "const { Console } = require('node:console');\nexports.a = function () {\n  return new Console({});\n};\nexports.b = function () {\n  return 1;\n};",
    };
    expect(tagsOf(code)).toEqual({ 'node:console.Console': ['a'] });
  });

  it('names both exports of a usage that two of three exports reach', () => {
    const code = lib(
      "function helper() {\n  return fs.watch('.');\n}\nexport function a() {\n  return helper();\n}\nexport function b() {\n  return helper();\n}\nexport function c() {\n  return 1;\n}\n",
    );
    expect(tagsOf(code)).toEqual({ 'node:fs.watch': ['a', 'b'] });
  });
});

const formatter: Source = {
  code: "const { Console } = require('node:console');\nexports.format = function () {\n  return new Console({});\n};",
};
const classMock: Source = {
  code: "const { format } = require('./formatter');\nclass Mock {\n  run() {\n    return format();\n  }\n}\nmodule.exports = Mock;",
  imports: { 'require-call:./formatter': 'formatter.js' },
};
const twoRequires: Source = {
  code: "const Mock = require('./mock');\nconst Other = require('./other');\nmodule.exports.Mock = Mock;\nmodule.exports.Other = Other;",
  imports: { 'require-call:./mock': 'mock.js', 'require-call:./other': 'other.js' },
};
const other: Source = { code: 'module.exports = function () {\n  return 1;\n};' };
const runsConsole = "const { Console } = require('node:console');\nconst c = new Console({});\n";

describe('the exports that reach a usage in a required file', () => {
  it('names the export that reaches a required file through a class', () => {
    const others = { 'mock.js': classMock, 'other.js': other, 'formatter.js': formatter };
    expect(tagsOf(twoRequires, others, 'formatter.js')).toEqual({
      'node:console.Console': ['Mock'],
    });
  });

  it('names both exports that reach the same required file', () => {
    const code: Source = {
      code: "exports.a = require('./mock');\nexports.b = require('./mock-b');\nexports.c = function () {\n  return 1;\n};",
      imports: { 'require-call:./mock': 'mock.js', 'require-call:./mock-b': 'mock-b.js' },
    };
    const others = { 'mock.js': classMock, 'mock-b.js': classMock, 'formatter.js': formatter };
    expect(tagsOf(code, others, 'formatter.js')).toEqual({ 'node:console.Console': ['a', 'b'] });
  });

  it('names the export whose code requires a file that cannot be traced', () => {
    const code: Source = {
      code: "exports.a = function () {\n  const run = require('./mock');\n  return run();\n};\nexports.b = function () {\n  return 1;\n};",
      imports: { 'require-call:./mock': 'mock.js' },
    };
    const mock = { code: `${runsConsole}module.exports = function () {\n  return c;\n};` };
    expect(tagsOf(code, { 'mock.js': mock }, 'mock.js')).toEqual({
      'node:console.Console': ['a'],
    });
  });
});

describe('the files that a module loads for every export', () => {
  it('leaves a usage that a required file runs when it loads', () => {
    const mock = { code: `${runsConsole}module.exports = function () {\n  return c;\n};` };
    expect(tagsOf(twoRequires, { 'mock.js': mock, 'other.js': other }, 'mock.js')).toEqual({
      'node:console.Console': undefined,
    });
  });

  it('leaves a usage that a required file that can be traced runs when it loads', () => {
    const mock = { code: `${runsConsole}exports.run = function () {\n  return c;\n};` };
    expect(tagsOf(twoRequires, { 'mock.js': mock, 'other.js': other }, 'mock.js')).toEqual({
      'node:console.Console': undefined,
    });
  });

  it('names the export whose file imports another file only to run it', () => {
    const code: Source = {
      code: "exports.a = function () {\n  const { a } = require('./a');\n  return a();\n};\nexports.b = function () {\n  return 1;\n};",
      imports: { 'require-call:./a': 'a.js' },
    };
    const others = {
      'a.js': entry("import './setup.js';\nexport function a() {}", { './setup.js': 'setup.js' }),
      'setup.js': { code: "import { Console } from 'node:console';\nnew Console({});" },
    };
    expect(tagsOf(code, others, 'setup.js')).toEqual({ 'node:console.Console': ['a'] });
  });
});

describe('the modules that are left as they are', () => {
  it('names nothing for a module with a single export', () => {
    expect(tagsOf(lib("export function a() {\n  return fs.watch('.');\n}\n"))).toEqual({
      'node:fs.watch': undefined,
    });
  });

  it('names nothing for a module that re-exports another with export *', () => {
    const code = lib(`export * from './other.js';\n${watchers}`);
    expect(tagsOf(code, { 'other.js': lib('export const x = 1;') })).toEqual({
      'node:fs.watch': undefined,
      'node:fs.watchFile': undefined,
    });
  });

  it('names nothing for a module that cannot be traced', () => {
    const code = lib(`${watchers}console.log(typeof module);`);
    expect(tagsOf(code)).toEqual({
      'node:fs.watch': undefined,
      'node:fs.watchFile': undefined,
    });
  });

  it('names nothing when the entry imports more than one module', () => {
    const { graph, modules } = build({
      'index.js': entry("import './a.js';\nimport './b.js';", {
        './a.js': 'a.js',
        './b.js': 'b.js',
      }),
      'a.js': lib(watchers),
      'b.js': lib(watchers),
    });
    const reached = reachedUsages(graph, modules);
    expect(tagUsagesByExport(graph, modules, reached)).toEqual(reached);
  });
});
