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
): Record<string, string[] | undefined> {
  const { graph, modules } = build({ 'index.js': harness, 'lib.js': code, ...others });
  const tagged = tagUsagesByExport(graph, modules, reachedUsages(graph, modules));
  return Object.fromEntries(
    (tagged.get('lib.js') ?? [])
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

  it('names both exports of a usage that two of three exports reach', () => {
    const code = lib(
      "function helper() {\n  return fs.watch('.');\n}\nexport function a() {\n  return helper();\n}\nexport function b() {\n  return helper();\n}\nexport function c() {\n  return 1;\n}\n",
    );
    expect(tagsOf(code)).toEqual({ 'node:fs.watch': ['a', 'b'] });
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
