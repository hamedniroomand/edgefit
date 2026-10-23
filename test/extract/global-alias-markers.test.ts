import { describe, expect, it } from 'vite-plus/test';

import { globalsOf, usagesOf } from '~/helpers.ts';

const dgram = "require('node:dgram');";
const withBun = (setup: string, test = 'g.Bun'): string =>
  `${setup}\nfunction load(c) {\n  if (typeof ${test} !== 'undefined') {\n    ${dgram}\n  }\n}`;
const limited = ['api node:dgram [bun]'];
const unlimited = ['api node:dgram'];
const dgramOf = (source: string): string[] =>
  usagesOf(source).filter(usage => usage.includes('dgram'));

// The checks of @sentry/server-utils, with `G` as the name of the global object.
const marks = `
const isBun = typeof G.Bun !== 'undefined';
const isDeno = typeof G.Deno !== 'undefined';
const isCloudflare = G.navigator?.userAgent === 'Cloudflare-Workers';
export function notCloudflare() { if (!isCloudflare) { ${dgram} } }
export function allThree() { if (!isBun && !isDeno && !isCloudflare) { ${dgram} } }
export function control() { if (isCloudflare) { ${dgram} } }
`;

describe('a runtime check through a const that holds the global object', () => {
  it('limits a branch as the same check on globalThis does', () => {
    const direct = usagesOf(marks.replaceAll('G.', 'globalThis.'));
    expect(direct).toEqual([
      'api node:dgram [not workerd]',
      'api node:dgram [not bun] [not deno] [not workerd]',
      'api node:dgram [workerd]',
    ]);
    expect(
      usagesOf(`const globalAny = globalThis;${marks.replaceAll('G.', 'globalAny.')}`),
    ).toEqual(direct);
  });

  it.each([
    ['globalThis', 'const g = globalThis;'],
    ['self', 'const g = self;'],
    ['a conditional of the names', 'const g = c ? self : globalThis;'],
    ['a const that holds the name', 'const h = globalThis; const g = h;'],
    ['a conditional of consts', 'const h = globalThis; const g = c ? h : self;'],
    ['a type assertion', 'const g = globalThis as any;'],
  ])('limits the branch when the const holds %s', (_name, setup) => {
    expect(usagesOf(withBun(setup))).toEqual(limited);
  });

  it('reads a const of an outer scope', () => {
    const source = `function outer() {\n  const g = globalThis;\n  return () => {\n    if (typeof g.Deno !== 'undefined') {\n      ${dgram}\n    }\n  };\n}`;
    expect(usagesOf(source)).toEqual(['api node:dgram [deno]']);
  });

  it('reads a conditional of the names as the object of a read', () => {
    expect(usagesOf(withBun('', '(c ? self : globalThis).Bun'))).toEqual(limited);
  });

  it('keeps reading the names that nothing declares', () => {
    expect(usagesOf(withBun('', 'globalThis.Bun'))).toEqual(limited);
  });

  it('applies to a check for a global as well', () => {
    const check = (name: string): string =>
      `const g = globalThis;\nif (!${name}.FileList) {\n  ${dgram}\n}`;
    expect(globalsOf(check('globalThis'))).toEqual(['node:dgram [no FileList]']);
    expect(globalsOf(check('g'))).toEqual(globalsOf(check('globalThis')));
  });
});

describe('a name that may not be the global object', () => {
  it.each([
    ['a let that nothing sets again', 'let g = globalThis;'],
    ['a var', 'var g = globalThis;'],
    ['a let that is set again', 'let g = globalThis; g = {};'],
    ['a let that a function sets again', 'let g = globalThis; function set(x) { g = x; }'],
    ['a function that returns it', 'const g = () => globalThis;'],
    ['a module', "const g = require('node:process');"],
    ['window', 'const g = window;'],
    ['a conditional with window', "const g = typeof window !== 'undefined' ? window : globalThis;"],
    ['two names joined by ||', 'const g = globalThis || self;'],
    ['consts that name each other', 'const g = h; const h = g;'],
  ])('limits nothing when the name holds %s', (_name, setup) => {
    expect(dgramOf(withBun(setup))).toEqual(unlimited);
  });

  it.each([
    ['a conditional', 'let g = globalThis; g = {};', '(c ? g : self).Bun'],
    [
      'a const that holds a conditional',
      'let g = globalThis; g = {}; const h = c ? g : self;',
      'h.Bun',
    ],
    ['a const that copies it', 'let g = globalThis; g = {}; const h = g;', 'h.Bun'],
    ['a member of it', 'let g = globalThis; g = {};', 'g.globalThis.Bun'],
  ])('limits nothing through %s when a let is set again', (_name, setup, test) => {
    expect(dgramOf(withBun(setup, test))).toEqual(unlimited);
  });

  it('limits nothing for a parameter that has the name of a const', () => {
    const source = withBun('const g = globalThis;').replace('load(c)', 'load(g)');
    expect(usagesOf(source)).toEqual(unlimited);
  });

  it('limits nothing for a var in a block that is set outside the block', () => {
    const source = `function f(c) {\n  if (c) {\n    var g = globalThis;\n    var check = () => {\n      if (typeof g.Bun !== 'undefined') {\n        ${dgram}\n      }\n    };\n  }\n  g = { Bun: 1 };\n}`;
    expect(usagesOf(source)).toEqual(unlimited);
  });
});

describe('other reads through a const that holds the global object', () => {
  it('folds a check of process.env.NODE_ENV', () => {
    const source = `const g = globalThis;\nif (g.process.env.NODE_ENV === 'development') {\n  ${dgram}\n}`;
    expect(usagesOf(source)).not.toContain('api node:dgram');
  });

  it('reports a call of Function with code in a string', () => {
    expect(usagesOf("const g = globalThis;\ng.Function('return 1');")).toContain(
      'api Function(string)',
    );
  });

  it('reports WebAssembly.instantiate with bytes', () => {
    const source =
      'const g = globalThis;\nexport const load = bytes => g.WebAssembly.instantiate(bytes);';
    expect(usagesOf(source)).toContain('api WebAssembly.instantiate(bytes)');
  });
});
