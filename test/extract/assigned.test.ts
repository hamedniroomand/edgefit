import { describe, expect, it } from 'vite-plus/test';

import { findAssignedOptions } from '@/extract/assigned.ts';
import { parse } from '@/extract/index.ts';
import { usagesOf } from '~/helpers.ts';

const guarded = `let c: any
if (typeof require !== 'undefined') {
  c = require('node:crypto')
  if (c && c.randomBytes) {
    globalThis.x = c.randomBytes(4)
  }
}`;

describe('following a variable that is assigned a module', () => {
  it('follows a variable that is assigned once', () => {
    const usages = usagesOf(guarded, 'lib/index.ts');
    expect(usages).toContain('api node:crypto.randomBytes [guarded]');
    expect(usages.some(usage => usage.startsWith('dynamic'))).toBe(false);
  });

  it.each([
    [
      'a var set inside a function',
      "var fs;\nfunction load() { fs = require('fs'); fs.watch('.'); }",
    ],
    [
      'a closure that reads it before the assignment',
      "let c;\nfunction watch() { return c.watch('.'); }\nc = require('fs');",
    ],
    [
      'a dynamic import',
      "let c;\nasync function load() { c = await import('node:fs'); c.watch('.'); }",
    ],
    ['a loop head', "for (let c;;) { c = require('fs'); c.watch('.'); }"],
    [
      'a require made by createRequire',
      "import { createRequire } from 'module';\nlet r;\nr = createRequire(import.meta.url);\nr('fs').watch('.');",
    ],
  ])('follows %s', (_name, source) => {
    const usages = usagesOf(source, 'lib/index.ts');
    expect(usages).toContain('api node:fs.watch');
    expect(usages).not.toContain('dynamic node:fs');
  });
});

describe('following a variable that starts with a value', () => {
  const initial = "var c = typeof self !== 'undefined' ? self.crypto || self.msCrypto : null;\n";

  it('follows a module that replaces the value', () => {
    const usages = usagesOf(
      `${initial}(function () {\n  c = require('node:crypto');\n  if (c && c.randomBytes) {\n    c.randomBytes(8);\n  }\n})();`,
      'lib/index.ts',
    );
    expect(usages).toContain('api node:crypto.randomBytes [guarded]');
    expect(usages.some(usage => usage.startsWith('dynamic'))).toBe(false);
  });

  it.each([
    ['null', "let c = null;\nc = require('fs');\nc.watch('.');"],
    ['an object', "let c = {};\nc = require('fs');\nc.watch('.');"],
  ])('follows a module that replaces %s', (_name, source) => {
    expect(usagesOf(source, 'lib/index.ts')).toContain('api node:fs.watch');
  });

  it('does not follow a variable that is set to two modules', () => {
    const usages = usagesOf(
      `${initial}c = require('node:crypto');\nc = require('node:fs');\nc.watch('.');`,
      'lib/index.ts',
    );
    expect(usages).not.toContain('api node:fs.watch');
  });
});

describe('reporting a variable that is assigned a module', () => {
  it.each([
    ['passed to a function', "let c;\nc = require('fs');\nuse(c);"],
    ['exported as the default', "let c;\nc = require('fs');\nexport default c;"],
    ['exported through the assignment', "let c;\nmodule.exports = c = require('fs');"],
    ['passed on as the assignment value', "let c;\nuse(c = require('fs'));"],
    ['bound by the assignment value', "let c;\nconst d = c = require('fs');"],
  ])('reports a module that is %s', (_name, source) => {
    expect(usagesOf(source, 'lib/index.ts')).toContain('dynamic node:fs');
  });
});

describe('not following a variable that is assigned a module', () => {
  it.each([
    ['assigned twice', "let c;\nc = require('fs');\nc = other;\nc.watch('.');"],
    ['assigned with an operator', "let c;\nc ||= require('fs');\nc.watch('.');"],
    ['updated', "let c;\nc = require('fs');\nc++;\nc.watch('.');"],
    ['set by a loop', "let c;\nfor (c of list) {}\nc = require('fs');\nc.watch('.');"],
    ['set by destructuring', "let c;\n[c] = list;\nc = require('fs');\nc.watch('.');"],
    ['exported in a list', "let c;\nc = require('fs');\nc.watch('.');\nexport { c };"],
    ['exported in place', "export let c;\nc = require('fs');\nc.watch('.');"],
    ['declared with a call', "let c = make();\nc = require('fs');\nc.watch('.');"],
    ['declared again with a value', "var c;\nc = require('fs');\nvar c = other;\nc.watch('.');"],
    ['a function', "var c;\nc = require('fs');\nfunction c() {}\nc.watch('.');"],
    ['a parameter', "function f(c) { c = require('fs'); c.watch('.'); }"],
    [
      'declared in another scope',
      "let c;\nfunction f() { let c; c = 1; }\nc = require('fs');\nc.watch('.');",
    ],
  ])('does not follow a variable that is %s', (_name, source) => {
    const usages = usagesOf(source, 'lib/index.ts');
    expect(usages).toContain('dynamic node:fs');
    expect(usages).not.toContain('api node:fs.watch');
  });

  it.each([
    ['a value that is not a module', "let c;\nc = load();\nc.watch('.');"],
    ['a shadowed require', "let c;\nfunction f(require) { c = require('fs'); }\nc.watch('.');"],
  ])('does not follow a variable that is assigned %s', (_name, source) => {
    expect(usagesOf(source, 'lib/index.ts')).toEqual([]);
  });
});

describe('a fallback that a catch assigns', () => {
  it('follows a variable that a catch gives a fallback that is not a module', () => {
    const source =
      "let http2;\ntry {\n  http2 = require('node:http2');\n} catch {\n  http2 = { constants: {} };\n}\nhttp2.connect('x');";
    const usages = usagesOf(source, 'lib/index.ts');
    expect(usages).toContain('api node:http2.connect');
    expect(usages.some(usage => usage.startsWith('dynamic'))).toBe(false);
  });

  it('keeps a second write that may hold a module, even when it can also be null', () => {
    const source =
      "let m;\ntry {\n  m = require('node:http2');\n} catch {\n  m = other ? require('node:vm') : null;\n}\nm.connect('x');";
    expect(usagesOf(source, 'lib/index.ts')).not.toContain('api node:http2.connect');
  });

  it('keeps a second write that can be a module', () => {
    const source =
      "let http2;\ntry {\n  http2 = require('node:http2');\n} catch {\n  http2 = other;\n}\nhttp2.connect('x');";
    expect(usagesOf(source, 'lib/index.ts')).not.toContain('api node:http2.connect');
  });
});

describe('the options that a file sets', () => {
  const optionsOf = (source: string): string[] =>
    findAssignedOptions(parse('lib/input.js', source).program.body as never);

  it.each([
    ['an object property', 'f({ http2: true });'],
    ['a string key', "f({ 'http2': 1 });"],
    ['a value that is not a literal', 'f({ http2: flag });'],
    ['a shorthand property', 'f({ http2 });'],
    ['a member assignment', 'options.http2 = true;'],
    ['a member assignment with ||=', 'options.http2 ||= true;'],
    ['a member assignment with ??=', 'options.http2 ??= 1;'],
    ['a literal in Object.assign', 'Object.assign(opts, { http2: true });'],
    ['a literal in a function in a property', 'f({ start() { g({ http2: true }); } });'],
  ])('reads %s', (_label, code) => {
    expect(optionsOf(code)).toEqual(['http2']);
  });

  it.each([
    ['false', 'f({ http2: false });'],
    ['zero', 'f({ http2: 0 });'],
    ['null', 'f({ http2: null });'],
    ['undefined', 'f({ http2: undefined });'],
    ['an empty string', "f({ http2: '' });"],
    ['a method', 'f({ http2() {} });'],
    ['a computed key', 'f({ [key]: true });'],
    ['an assignment of false', 'options.http2 = false;'],
    ['a compound assignment', 'options.http2 += 1;'],
  ])('does not read %s', (_label, code) => {
    expect(optionsOf(code)).toEqual([]);
  });
});

describe('the nested properties of an object', () => {
  const optionsOf = (source: string): string[] =>
    findAssignedOptions(parse('lib/input.js', source).program.body as never);

  it.each([
    ['a nested property', 'f({ server: { http2: true } });', ['server']],
    [
      'a property of a schema',
      "f({ properties: { http2: { type: 'boolean' } } });",
      ['properties'],
    ],
    ['a property in an array in a property', 'f({ list: [{ http2: true }] });', ['list']],
  ])('only reads the direct property for %s', (_label, code, names) => {
    expect(optionsOf(code)).toEqual(names);
  });
});

describe('an assignment under a test of the same member', () => {
  const optionsOf = (source: string): string[] =>
    findAssignedOptions(parse('lib/input.js', source).program.body as never);

  it.each([
    ['a test against undefined', 'if (data.http2 !== undefined) { data["http2"] = coerced; }'],
    ['a loose test against null', 'if (data.http2 != null) data.http2 = coerced;'],
    ['the member as the test', 'if (data.http2) { data.http2 = coerced; }'],
    ['a typeof test', "if (typeof data.http2 !== 'undefined') { data.http2 = coerced; }"],
    ['a test inside &&', 'if (ok && data.http2 !== undefined) { data.http2 = coerced; }'],
    ['a nested block', 'if (data.http2 !== undefined) { if (x) { data.http2 = coerced; } }'],
  ])('does not count under %s', (_label, code) => {
    expect(optionsOf(code)).toEqual([]);
  });

  it.each([
    ['a test of an absent member', 'if (!data.http2) data.http2 = 1;'],
    ['a test against undefined for absence', 'if (data.http2 === undefined) data.http2 = 1;'],
    ['a test for null', 'if (data.http2 == null) data.http2 = 1;'],
    ['the else branch', 'if (data.http2 !== undefined) { x(); } else { data.http2 = 1; }'],
    ['a test of another member', 'if (data.other !== undefined) data.http2 = coerced;'],
    ['a test of another object', 'if (other.http2 !== undefined) data.http2 = coerced;'],
    ['a default assignment', 'data.http2 ??= 1;'],
    [
      'a function under the if',
      'if (data.http2 !== undefined) { run(() => { data.http2 = coerced; }); }',
    ],
    ['an || test', 'if (ok || data.http2 !== undefined) data.http2 = coerced;'],
  ])('counts under %s', (_label, code) => {
    expect(optionsOf(code)).toEqual(['http2']);
  });
});
