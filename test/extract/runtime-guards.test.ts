import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const fs = "import fs from 'node:fs';\n";
const watch = (...tags: string[]): string[] => [
  'api node:fs',
  `api node:fs.watch${tags.map(tag => ` [${tag}]`).join('')}`,
];

describe('usages behind a check for the runtime', () => {
  it('knows the branch of typeof Deno and typeof Bun', () => {
    expect(usagesOf(`${fs}if (typeof Deno !== 'undefined') fs.watch('.');`)).toEqual(watch('deno'));
    expect(usagesOf(`${fs}if (typeof Bun === 'object') fs.watch('.');`)).toEqual(watch('bun'));
    expect(usagesOf(`${fs}if (typeof globalThis.Deno !== 'undefined') fs.watch('.');`)).toEqual(
      watch('deno'),
    );
    expect(usagesOf(`${fs}if ('Deno' in globalThis) fs.watch('.');`)).toEqual(watch('deno'));
  });

  it('knows the else branch of the same checks', () => {
    expect(usagesOf(`${fs}if (typeof Deno !== 'undefined') noop(); else fs.watch('.');`)).toEqual(
      watch('not deno'),
    );
    expect(usagesOf(`${fs}if (typeof Bun === 'undefined') fs.watch('.');`)).toEqual(
      watch('not bun'),
    );
    expect(usagesOf(`${fs}if (!('Bun' in globalThis)) fs.watch('.');`)).toEqual(watch('not bun'));
  });

  it('knows process.versions.bun and process.versions.deno', () => {
    expect(usagesOf(`${fs}if (process.versions.bun) fs.watch('.');`)).toEqual(watch('bun'));
    expect(usagesOf(`${fs}if (process.versions?.deno) fs.watch('.');`)).toEqual(watch('deno'));
    expect(usagesOf(`${fs}if (!process.versions.bun) fs.watch('.');`)).toEqual(watch('not bun'));
    expect(usagesOf(`${fs}if (typeof process.versions.bun === 'string') fs.watch('.');`)).toEqual(
      watch('bun'),
    );
    expect(usagesOf(`${fs}if (process.versions.bun != null) fs.watch('.');`)).toEqual(watch('bun'));
    expect(
      usagesOf(
        `import process from 'node:process';\n${fs}if (process.versions.bun) fs.watch('.');`,
      ),
    ).toEqual(['api node:process', 'api node:fs', 'api node:fs.watch [bun]']);
  });

  it('adds up the branches of an else-if chain', () => {
    const source = `${fs}if (typeof Deno !== 'undefined') {\n  noop();\n} else if (process.versions?.bun) {\n  noop();\n} else {\n  fs.watch('.');\n}`;
    expect(usagesOf(source)).toEqual(watch('not deno', 'not bun'));
  });
});

describe('usages behind a check for the runtime: more forms', () => {
  it('knows the runtime from a guard clause and from && and ?:', () => {
    expect(
      usagesOf(
        `${fs}function run() {\n  if (typeof Deno === 'undefined') return;\n  fs.watch('.');\n}`,
      ),
    ).toEqual(watch('deno'));
    expect(usagesOf(`${fs}typeof Bun !== 'undefined' && fs.watch('.');`)).toEqual(watch('bun'));
    expect(usagesOf(`${fs}const stop = process.versions.bun ? fs.watch('.') : null;`)).toEqual(
      watch('bun'),
    );
  });

  it('knows the runtime from navigator.userAgent', () => {
    expect(
      usagesOf(`${fs}if (navigator.userAgent === 'Cloudflare-Workers') fs.watch('.');`),
    ).toEqual(watch('workerd'));
    expect(
      usagesOf(`${fs}if (navigator.userAgent !== 'Cloudflare-Workers') fs.watch('.');`),
    ).toEqual(watch('not workerd'));
    expect(usagesOf(`${fs}if (navigator.userAgent.startsWith('Bun/')) fs.watch('.');`)).toEqual(
      watch('bun'),
    );
    expect(usagesOf(`${fs}if (navigator.userAgent.includes('Deno')) fs.watch('.');`)).toEqual(
      watch('deno'),
    );
  });

  it('sees through Boolean(...)', () => {
    expect(usagesOf(`${fs}if (Boolean(process.versions.bun)) fs.watch('.');`)).toEqual([
      'api node:fs',
      'api node:process.versions.bun',
      'api node:fs.watch [bun]',
    ]);
    expect(
      usagesOf(
        `${fs}function isBun() {\n  return Boolean(process.versions.bun);\n}\nif (isBun()) fs.watch('.');`,
      ),
    ).toEqual(['api node:fs', 'api node:process.versions.bun', 'api node:fs.watch [bun]']);
    expect(
      usagesOf(`${fs}const Boolean = f;\nif (Boolean(process.versions.bun)) fs.watch('.');`),
    ).toEqual(['api node:fs', 'api node:process.versions.bun', 'api node:fs.watch']);
  });

  it('marks a dynamic usage in the same branch', () => {
    expect(usagesOf(`if (typeof Deno !== 'undefined') {\n  require(name);\n}`)).toEqual([
      'dynamic require(<expression>) [deno]',
    ]);
  });
});

describe('checks that say nothing about the runtime', () => {
  it('ignores a name the code declares itself', () => {
    expect(
      usagesOf(`${fs}const Deno = load();\nif (typeof Deno !== 'undefined') fs.watch('.');`),
    ).toEqual(watch());
    expect(usagesOf(`${fs}function f(Bun) {\n  if (Bun) fs.watch('.');\n}`)).toEqual(watch());
  });

  it('ignores other checks and checks that leave the runtime open', () => {
    expect(usagesOf(`${fs}if (typeof window !== 'undefined') fs.watch('.');`)).toEqual(watch());
    // Either runtime may be the one, so neither is known.
    expect(
      usagesOf(
        `${fs}if (typeof Deno !== 'undefined' || typeof Bun !== 'undefined') fs.watch('.');`,
      ),
    ).toEqual(watch());
    // A type other than the one tested for says nothing about whether the value exists.
    expect(usagesOf(`${fs}if (typeof Deno !== 'string') fs.watch('.');`)).toEqual(watch());
    expect(usagesOf(`${fs}if (process.versions.node) fs.watch('.');`)).toEqual(watch());
    // Bun and Deno add a version, so an exact match with the bare name never holds.
    expect(usagesOf(`${fs}if (navigator.userAgent === 'Bun') noop(); else fs.watch('.');`)).toEqual(
      watch(),
    );
    expect(usagesOf(`${fs}if (navigator.userAgent !== 'Deno') fs.watch('.');`)).toEqual(watch());
    expect(usagesOf(`${fs}if (navigator.userAgent === 'Node.js/22') fs.watch('.');`)).toEqual(
      watch(),
    );
  });

  it('does not carry a branch to the code after it', () => {
    expect(
      usagesOf(`${fs}if (typeof Deno !== 'undefined') {\n  noop();\n}\nfs.watch('.');`),
    ).toEqual(watch());
  });
});
