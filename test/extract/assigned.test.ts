import { describe, expect, it } from 'vite-plus/test';

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
    ['declared with a value', "let c = {};\nc = require('fs');\nc.watch('.');"],
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
