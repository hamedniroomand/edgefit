import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const globals = new Set(['globalThis', 'self', 'global', 'Worker', 'structuredClone']);
const usages = (source: string): string[] => usagesOf(source, 'src/input.ts', globals);
const alias = "var g = typeof window !== 'undefined' ? window : globalThis;\n";

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
