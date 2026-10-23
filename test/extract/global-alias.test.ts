import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const globals = new Set(['globalThis', 'self', 'global', 'Worker', 'structuredClone']);
const usages = (source: string): string[] => usagesOf(source, 'src/input.ts', globals);
const alias = "const g = typeof window !== 'undefined' ? window : globalThis;\n";

describe('a check through an alias of the global object', () => {
  it('guards a `new` after a member check', () => {
    expect(usages(`${alias}if (g.Worker) { new Worker('x'); }`)).toEqual(['api Worker [guarded]']);
  });

  it('guards a call and a member read', () => {
    expect(usages(`${alias}if (g.structuredClone) { structuredClone(1); }`)).toContain(
      'api structuredClone [guarded]',
    );
    expect(usages(`${alias}if (g.Worker) { g.Worker.prototype; }`)).toEqual([
      'api Worker.prototype [guarded]',
    ]);
  });

  it('guards after `typeof` and `in`', () => {
    expect(usages(`${alias}if (typeof g.Worker !== 'undefined') { new Worker('x'); }`)).toContain(
      'api Worker [guarded]',
    );
    expect(usages(`${alias}if ('Worker' in g) { new Worker('x'); }`)).toContain(
      'api Worker [guarded]',
    );
  });

  it('follows a plain alias and a conditional of the other names', () => {
    expect(usages("const g = self;\nif (g.Worker) { new Worker('x'); }")).toEqual([
      'api Worker [guarded]',
    ]);
    expect(usages("const g = a ? self : global;\nif (g.Worker) { new Worker('x'); }")).toEqual([
      'api Worker [guarded]',
    ]);
  });

  it('follows a conditional of a name that is already an alias', () => {
    expect(
      usages("const a = globalThis;\nconst g = c ? a : self;\nif (g.Worker) { new Worker('x'); }"),
    ).toEqual(['api Worker [guarded]']);
  });

  it('does not follow a conditional that holds another value', () => {
    expect(usages("const g = a ? self : other;\nif (g.Worker) { new Worker('x'); }")).toEqual([
      'api Worker',
    ]);
  });
});

describe('a check through a let or a var that holds the global object', () => {
  const checked = (declaration: string): string[] =>
    usages(`${declaration}\nif (g.Worker) { new Worker('x'); }`);

  it.each([
    ['a let', 'let g = globalThis;'],
    ['a var', 'var g = globalThis;'],
    [
      'the UMD var of a conditional',
      "var g = typeof window !== 'undefined' ? window : globalThis;",
    ],
    ['a let that the code writes again', 'let g = globalThis;\ng = {};'],
    ['a const that copies a let', 'let a = globalThis;\na = {};\nconst g = a;'],
    [
      'a const that copies a conditional with a let',
      'let a = globalThis;\nconst g = c ? a : self;',
    ],
  ])('guards nothing for %s', (_name, declaration) => {
    expect(checked(declaration)).toEqual(['api Worker']);
  });

  it.each([
    ['typeof', "if (typeof g.Worker !== 'undefined') { new Worker('x'); }"],
    ['in', "if ('Worker' in g) { new Worker('x'); }"],
    ['a guard clause', "if (!g.Worker) throw new Error('x');\nnew Worker('x');"],
    ['a logical and', "g.Worker && new Worker('x');"],
    ['a conditional', "g.Worker ? new Worker('x') : null;"],
  ])('guards nothing after %s', (_name, check) => {
    expect(usages(`let g = globalThis;\n${check}`)).toEqual(['api Worker']);
  });

  it('guards nothing for a check through a conditional that has a let', () => {
    expect(usages("let a = globalThis;\nif ((c ? a : self).Worker) { new Worker('x'); }")).toEqual([
      'api Worker',
    ]);
  });

  it('still reads a use through the let', () => {
    expect(usages("let g = globalThis;\nnew g.Worker('x');")).toEqual(['api Worker']);
  });

  it('guards a check through a let that holds another API', () => {
    expect(usages('let w = Worker;\nif (w.prototype) { w.prototype.x; }')).toEqual([
      'api Worker',
      'api Worker.prototype.x [guarded]',
    ]);
  });
});

describe('a check of a name that was read through a let or a var that holds the global object', () => {
  const lastUsage = (declaration: string): string | undefined =>
    usages(`${declaration}\nif (w) { new w('x'); }`).at(-1);

  it.each([
    ['a const that holds a member', 'let g = globalThis;\nconst w = g.Worker;'],
    ['a const from a destructuring', 'let g = globalThis;\nconst { Worker: w } = g;'],
    ['a const that copies such a const', 'let g = globalThis;\nconst a = g.Worker;\nconst w = a;'],
    ['a let that holds a member', 'var g = globalThis;\nlet w = g.Worker;'],
    [
      'a destructuring with a rest element',
      'let g = globalThis;\nconst { Worker: w, ...rest } = g;',
    ],
    ['a nested destructuring', 'let g = globalThis;\nconst { self: { Worker: w } } = g;'],
    ['an assignment', 'let g = globalThis;\nlet w;\nw = g.Worker;'],
    ['a destructuring assignment', 'let g = globalThis;\nlet w;\n({ Worker: w } = g);'],
  ])('guards nothing for %s', (_name, declaration) => {
    expect(lastUsage(declaration)).toBe('api Worker');
  });

  it('does not count a store through a const that copies a let as a polyfill store', () => {
    const found = usages("let g = globalThis;\nconst h = g;\nh.fetch ??= new Worker('x');");
    expect(found.at(-1)).toBe('api Worker');
  });

  it('counts a store through a const that holds the global object as a polyfill store', () => {
    const found = usages("const h = globalThis;\nh.fetch ??= new Worker('x');");
    expect(found.at(-1)).not.toBe('api Worker');
  });

  it('guards the check when the name was read through a const', () => {
    expect(lastUsage('const g = globalThis;\nconst w = g.Worker;')).toBe('api Worker [guarded]');
  });
});
