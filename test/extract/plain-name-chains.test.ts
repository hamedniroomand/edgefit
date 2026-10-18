import { describe, expect, it } from 'vite-plus/test';

import { globalsOf, usagesOf } from '~/helpers.ts';

const globals = new Set(['globalThis', 'Deno', 'X', 'process', 'BroadcastChannel', 'Bun']);

/** The usages of `source`, then each usage that has a global condition. */
const resultOf = (source: string): string[] => [
  ...usagesOf(source, 'src/input.ts', globals),
  ...globalsOf(source, globals).filter(usage => usage.includes('[')),
];

/**
 * Each case: a statement that reads a member of a compiled chain on a plain name, or calls it
 * directly, alone or in a list joined with commas, the result before this change, and the result
 * now. Each read throws when the name is missing.
 */
const restored: [string, string[], string[]][] = [
  [
    '(BroadcastChannel == null ? void 0 : BroadcastChannel.prototype).x;',
    [
      'api BroadcastChannel.prototype [guarded]',
      'BroadcastChannel.prototype [has BroadcastChannel]',
    ],
    ['api BroadcastChannel.prototype.x'],
  ],
  [
    '(BroadcastChannel === null || BroadcastChannel === void 0 ? void 0 : BroadcastChannel.prototype).x;',
    [
      'api BroadcastChannel.prototype [guarded]',
      'BroadcastChannel.prototype [has BroadcastChannel] [has BroadcastChannel]',
    ],
    ['api BroadcastChannel.prototype.x'],
  ],
  [
    "import fs from 'node:fs';\n(fs == null ? void 0 : fs.promises).watch(d);",
    ['api node:fs', 'api node:fs.promises [guarded]'],
    ['api node:fs', 'api node:fs.promises.watch'],
  ],
  ['(X == null ? void 0 : X.y)();', ['api X.y [guarded]', 'X.y [has X]'], ['api X.y']],
  [
    "const d = globalThis.Deno;\n(d == null ? void 0 : d.env).get('X');",
    ['api Deno [guarded]', 'api Deno.env [guarded]'],
    ['api Deno [guarded]', 'api Deno.env.get'],
  ],
  ['(X != null ? X.y : void 0).z;', ['api X.y [guarded]', 'X.y [has X]'], ['api X.y.z']],
  ['(X == null ? void 0 : X.y.z).w;', ['api X.y.z [guarded]', 'X.y.z [has X]'], ['api X.y.z.w']],
  ['(X == null ? void 0 : X.y).z.w();', ['api X.y [guarded]', 'X.y [has X]'], ['api X.y.z.w']],
  [
    'async function h() {\n  (await (X == null ? void 0 : X.y)).z;\n}',
    ['api X.y [guarded]', 'X.y [has X]'],
    ['api X.y.z'],
  ],
  ['(X == null ? void 0 : X.y).z, f();', ['api X.y [guarded]', 'X.y [has X]'], ['api X.y.z']],
  ['(X == null ? void 0 : X["y"]).z;', ['api X.y [guarded]', 'X.y [has X]'], ['api X.y.z']],
  ['g(),(X==null?void 0:X.y).z,h();', ['api X.y [guarded]', 'X.y [has X]'], ['api X.y.z']],
  ['f(), (X == null ? void 0 : X.y).z;', ['api X.y [guarded]', 'X.y [has X]'], ['api X.y.z']],
  ['((X == null ? void 0 : X.y).z, f());', ['api X.y [guarded]', 'X.y [has X]'], ['api X.y.z']],
];

describe('a statement that reads a compiled chain on a plain name', () => {
  it.each(restored)('%s is a use', (source, before, now) => {
    expect(resultOf(source)).not.toEqual(before);
    expect(resultOf(source)).toEqual(now);
  });

  it('gives the result of its source form', () => {
    expect(resultOf('(X == null ? void 0 : X.prototype).x;')).toEqual(
      resultOf('(X?.prototype).x;'),
    );
    expect(resultOf('(X == null ? void 0 : X.y)();')).toEqual(resultOf('(X?.y)();'));
  });
});

/** Each case: a plain-name form that keeps the result it had before this change. */
const kept: [string, string[]][] = [
  [
    'const d = globalThis.Deno;\nd == null ? void 0 : d.cwd();',
    ['api Deno [guarded]', 'api Deno.cwd [guarded]'],
  ],
  [
    'const d = globalThis.Deno;\n(d == null ? void 0 : d.cwd()).x;',
    ['api Deno [guarded]', 'api Deno.cwd [guarded]'],
  ],
  ['X == null ? void 0 : X.y.z();', ['api X.y.z [guarded]', 'X.y.z [has X]']],
  ['Deno == null ? void 0 : Deno.cwd();', ['api Deno.cwd [guarded] [deno]']],
  [
    "import fs from 'node:fs';\nfs == null ? void 0 : fs.watch('.');",
    ['api node:fs', 'api node:fs.watch [guarded]'],
  ],
  ['X == null ? void 0 : X.y;', ['api X.y [guarded]', 'X.y [has X]']],
  ['X == null ? void 0 : X.y.z;', ['api X.y.z [guarded]', 'X.y.z [has X]']],
  [
    'const p = (X == null ? void 0 : X.prototype).x;',
    ['api X.prototype [guarded]', 'X.prototype [has X]'],
  ],
  [
    'function f() {\n  return (X == null ? void 0 : X.y).z;\n}',
    ['api X.y [guarded]', 'X.y [has X]'],
  ],
  ['g((X == null ? void 0 : X.y).z);', ['api X.y [guarded]', 'X.y [has X]']],
  [
    'if ((X == null ? void 0 : X.y).z) X.y.z.w();',
    ['api X.y [guarded]', 'api X.y.z.w', 'X.y [has X]'],
  ],
  [
    '(X == null ? void 0 : X.y.z) && X.y.z.w();',
    ['api X.y.z [guarded]', 'api X.y.z.w', 'X.y.z [has X]'],
  ],
  [
    'const ok = (X == null ? void 0 : X.y).z;\nif (ok) X.y.z.w();',
    ['api X.y [guarded]', 'api X.y.z.w', 'X.y [has X]'],
  ],
  ['(X == null ? void 0 : X.y)?.z;', ['api X.y [guarded]', 'X.y [has X]']],
  ['(X == null ? void 0 : X.y).z ?? 1;', ['api X.y [guarded]', 'X.y [has X]']],
  ['new (X == null ? void 0 : X.y)();', ['api X.y [guarded]', 'X.y [has X]']],
  ['const { a } = (X == null ? void 0 : X.y);', ['api X.y [guarded]', 'X.y [has X]']],
  ['(X == null ? void 0 : X.y).call(X);', ['api X.y [guarded]', 'api X', 'X.y [has X]']],
  ['(X == null ? void 0 : X.y)[k];', ['api X.y [guarded]', 'X.y [has X]']],
  [
    'var _a;\nconst v = (_a = X == null ? void 0 : X.y.z) == null ? void 0 : _a.w;',
    ['api X.y.z [guarded]', 'X.y.z [has X]'],
  ],
  [
    'var _a;\nconst v = (_a = X === null || X === void 0 ? void 0 : X.y.z) === null || _a === void 0 ? void 0 : _a.w;',
    ['api X.y.z [guarded]', 'X.y.z [has X] [has X]'],
  ],
  [
    'var _a;\n(_a = X == null ? void 0 : X.y.z) == null ? void 0 : _a.w();',
    ['api X.y.z [guarded]', 'X.y.z [has X]'],
  ],
  [
    'const d = globalThis.Deno;\nconst v = d != null ? d : globalThis.Bun;\nv.x();',
    ['api Deno [guarded]', 'api Deno [guarded]', 'api Bun'],
  ],
  [
    'const v = X != null ? X : process.env;',
    ['api X [guarded]', 'api node:process.env', 'X [has X]', 'node:process.env [no X]'],
  ],
  [
    'const d = globalThis.Deno;\nd != null && d.cwd();',
    ['api Deno [guarded]', 'api Deno.cwd [guarded]'],
  ],
  [
    "import fs from 'node:fs';\nfs != null && fs.watch('.');",
    ['api node:fs', 'api node:fs.watch [guarded]'],
  ],
  [
    "import fs from 'node:fs';\nfs !== null && fs !== void 0 && fs.watch('.');",
    ['api node:fs', 'api node:fs.watch [guarded]'],
  ],
  [
    '(X == null ? void 0 : X[k]).z;',
    ['api X [guarded]', 'dynamic X[<expression>]', 'X [has X]', 'X[<expression>] [has X]'],
  ],
  ['(X == null ? void 0 : X.y as any).z;', ['api X.y [guarded]', 'X.y [has X]']],
  [
    'const a = globalThis.Deno, b = globalThis.process;\n(a == null ? void 0 : b.env).x;',
    ['api Deno [guarded]', 'api node:process', 'api node:process.env'],
  ],
  ['const v = (g(), (X == null ? void 0 : X.y).z);', ['api X.y [guarded]', 'X.y [has X]']],
  ['(g(), (X == null ? void 0 : X.y).z).w;', ['api X.y [guarded]', 'X.y [has X]']],
  ['(X == null ? void 0 : X.y), f();', ['api X.y [guarded]', 'X.y [has X]']],
  ['(0, (X == null ? void 0 : X.y)).z;', ['api X.y [guarded]', 'X.y [has X]']],
];

describe('a plain-name form that keeps its result', () => {
  it.each(kept)('%s', (source, result) => {
    expect(resultOf(source)).toEqual(result);
  });
});
