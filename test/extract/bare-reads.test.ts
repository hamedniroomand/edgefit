import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const globals = new Set(['document', 'window', 'X', 'globalThis', 'process']);
const loadOnlyGlobals = new Set(['document', 'window']);

/** The uses of `document` in a snippet, with where each one runs and how the code names it. */
const readsOf = (source: string): string[] =>
  usagesOf(source, 'src/input.ts', globals, { loadOnlyGlobals }).filter(usage =>
    usage.includes('document'),
  );

/** `load` when the one use of `document` runs as the module loads, `later` when it does not. */
function whenOf(source: string): string {
  const reads = readsOf(source);
  expect(reads).toHaveLength(1);
  return reads[0]?.includes('[at load]') === true ? 'load' : 'later';
}

describe('a read of a missing global by its bare name', () => {
  it('runs as the module loads at the top of the file, in a block, and in the head of a branch', () => {
    expect(readsOf('document.title;')).toEqual(['api document.title [at load] [bare]']);
    expect(whenOf('{ document.title; }')).toBe('load');
    expect(whenOf('if (document.x) {}')).toBe('load');
    expect(whenOf('const a = document.x ? 1 : 2;')).toBe('load');
    expect(whenOf('const a = document.x && 1;')).toBe('load');
    expect(whenOf('const a = document.x || 1;')).toBe('load');
    expect(whenOf('const a = document.x ?? 1;')).toBe('load');
    expect(whenOf('for (const a of document.x) {}')).toBe('load');
    expect(whenOf('switch (document.x) {}')).toBe('load');
    expect(whenOf('class A { static x = document.x; }')).toBe('load');
  });

  it.each([
    ['a function declaration', 'function f() { document.x; }'],
    ['an arrow function', 'const f = () => document.x;'],
    ['a method', 'class A { m() { document.x; } }'],
    ['an instance field', 'class A { x = document.x; }'],
    ['the consequent of an if', 'if (a) { document.x; }'],
    ['the alternate of an if', 'if (a) {} else { document.x; }'],
    ['a branch of ?:', 'const v = a ? document.x : 1;'],
    ['the right side of &&', 'const v = a && document.x;'],
    ['the right side of ||', 'const v = a || document.x;'],
    ['the right side of ??', 'const v = a ?? document.x;'],
    ['the right side of ??=', 'let v; v ??= document.x;'],
    ['a while loop', 'while (a) { document.x; }'],
    ['a for loop', 'for (;;) { document.x; }'],
    ['a try block', 'try { document.x; } catch {}'],
    ['a catch block', 'try {} catch { document.x; }'],
    ['a switch case', 'switch (a) { case 1: document.x; }'],
    ['a function that runs at once', '(function () { document.x; })();'],
    ['a finally block', 'try {} finally { document.x; }'],
    ['an accessor field', 'class A { accessor x = document.x; }'],
    ['a case test', 'switch (a) { case document.x: }'],
  ])('runs later in %s', (_name, source) => {
    expect(whenOf(source)).toBe('later');
  });
});

describe('a check of a missing global by its bare name', () => {
  it.each([
    '!document;',
    'if (document) {}',
    'document && 1;',
    'document == null;',
    'document === undefined;',
    'document?.x;',
    'const a = document ?? 1;',
    'const a = document || 1;',
  ])('reads the name, so it is a use: %s', source => {
    expect(readsOf(source)).toEqual(['api document [at load] [bare]']);
  });

  it('is no use as `typeof name`, and is a use as `typeof name.member`', () => {
    expect(readsOf("typeof document === 'undefined';")).toEqual([]);
    expect(readsOf("typeof (document) === 'undefined';")).toEqual([]);
    expect(readsOf("if (typeof document !== 'undefined') {}")).toEqual([]);
    expect(readsOf("typeof document.title === 'string';")).toEqual([
      'api document [at load] [bare]',
    ]);
  });

  it('stays a check for a name that the target does not lack', () => {
    expect(usagesOf('if (!X) {}', 'src/input.ts', globals, { loadOnlyGlobals })).toEqual([]);
    expect(usagesOf('X?.y;', 'src/input.ts', globals, { loadOnlyGlobals })).toEqual([]);
  });
});

describe('a read of a missing global after the file sets it on the global object', () => {
  it.each([
    ["if (typeof document === 'undefined') { globalThis.document = {}; }\ndocument.title;"],
    ['globalThis.document ??= {};\ndocument.title;'],
    ['self.document = {};\ndocument.title;'],
  ])('is not a read at load: %s', source => {
    expect(whenOf(source)).toBe('later');
  });

  it('is a read at load before the file sets the global, and for another name', () => {
    expect(whenOf('document.title;\nglobalThis.document = {};')).toBe('load');
    expect(whenOf('globalThis.window = {};\ndocument.title;')).toBe('load');
  });
});

describe('a read of a missing global that is not a bare name', () => {
  it('is a use that runs at load through the global object, and is not bare', () => {
    expect(readsOf('globalThis.document.title;')).toEqual(['api document.title [at load]']);
    expect(readsOf('const f = () => globalThis.document.title;')).toEqual(['api document.title']);
  });

  it('is no use when a scope declares the name', () => {
    expect(readsOf('const document = {};\ndocument.title;')).toEqual([]);
    expect(readsOf('function f(document) { document.title; }')).toEqual([]);
    expect(readsOf('for (const document of []) { document.title; }')).toEqual([]);
  });

  it('is not marked without a target that lacks the name', () => {
    expect(usagesOf('document.title;', 'src/input.ts', globals)).toEqual(['api document.title']);
  });
});
