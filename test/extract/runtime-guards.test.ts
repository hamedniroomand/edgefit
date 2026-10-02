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

describe('usages behind a check for a platform', () => {
  it('knows typeof EdgeRuntime, which names Vercel', () => {
    expect(usagesOf(`${fs}if (typeof EdgeRuntime !== 'undefined') fs.watch('.');`)).toEqual(
      watch('vercel-edge'),
    );
  });

  it('knows typeof Netlify, and its else branch', () => {
    expect(usagesOf(`${fs}if (typeof Netlify !== 'undefined') fs.watch('.');`)).toEqual(
      watch('netlify'),
    );
    expect(usagesOf(`${fs}if (typeof Netlify === 'undefined') fs.watch('.');`)).toEqual(
      watch('not netlify'),
    );
  });
});

describe('usages behind a check on a runtime marker’s type', () => {
  it('knows the form Vercel documents, typeof EdgeRuntime !== "string"', () => {
    expect(usagesOf(`${fs}if (typeof EdgeRuntime !== 'string') fs.watch('.');`)).toEqual(
      watch('not vercel-edge'),
    );
    expect(usagesOf(`${fs}if (typeof EdgeRuntime === 'string') fs.watch('.');`)).toEqual(
      watch('vercel-edge'),
    );
  });

  it('knows the else branch, and the undefined form beside it', () => {
    expect(
      usagesOf(`${fs}if (typeof EdgeRuntime === 'string') noop(); else fs.watch('.');`),
    ).toEqual(watch('not vercel-edge'));
    expect(usagesOf(`${fs}if (typeof EdgeRuntime === 'undefined') fs.watch('.');`)).toEqual(
      watch('not vercel-edge'),
    );
  });

  it('knows the object type of Deno, Bun and Netlify', () => {
    expect(usagesOf(`${fs}if (typeof Deno === 'object') fs.watch('.');`)).toEqual(watch('deno'));
    expect(usagesOf(`${fs}if (typeof Deno !== 'object') fs.watch('.');`)).toEqual(
      watch('not deno'),
    );
    expect(usagesOf(`${fs}if (typeof Netlify !== 'object') fs.watch('.');`)).toEqual(
      watch('not netlify'),
    );
  });

  it('leaves a check against another type as before', () => {
    expect(usagesOf(`${fs}if (typeof Deno === 'function') fs.watch('.');`)).toEqual(watch('deno'));
  });
});

// The read of process.env.NEXT_RUNTIME is a usage too; these tests are about what it guards.
const watchUsages = (code: string): string[] =>
  usagesOf(code).filter(usage => usage.startsWith('api node:fs.watch'));
const only = (...tags: string[]): string[] => watch(...tags).slice(1);

describe('usages behind process.env.NEXT_RUNTIME', () => {
  it('knows edge means Vercel’s Edge runtime, and nodejs means it is not', () => {
    const edge = "process.env.NEXT_RUNTIME === 'edge'";
    expect(watchUsages(`${fs}if (${edge}) fs.watch('.');`)).toEqual(only('vercel-edge'));
    expect(watchUsages(`${fs}if (process.env.NEXT_RUNTIME !== 'edge') fs.watch('.');`)).toEqual(
      only('not vercel-edge'),
    );
    expect(watchUsages(`${fs}if (process.env.NEXT_RUNTIME === 'nodejs') fs.watch('.');`)).toEqual(
      only('not vercel-edge'),
    );
    expect(watchUsages(`${fs}if (process.env.NEXT_RUNTIME !== 'nodejs') fs.watch('.');`)).toEqual(
      only('vercel-edge'),
    );
  });

  it('knows the else branch, a bracket read, a helper and a guard clause', () => {
    expect(
      watchUsages(`${fs}if (process.env.NEXT_RUNTIME === 'edge') noop(); else fs.watch('.');`),
    ).toEqual(only('not vercel-edge'));
    expect(watchUsages(`${fs}if (process.env['NEXT_RUNTIME'] === 'edge') fs.watch('.');`)).toEqual(
      only('vercel-edge'),
    );
    expect(
      watchUsages(
        `${fs}const isEdge = () => process.env.NEXT_RUNTIME === 'edge';\nif (isEdge()) fs.watch('.');`,
      ),
    ).toEqual(only('vercel-edge'));
    expect(
      watchUsages(
        `${fs}function f() { if (process.env.NEXT_RUNTIME === 'edge') return; fs.watch('.'); }`,
      ),
    ).toEqual(only('not vercel-edge'));
  });

  it('ignores other values and other variables', () => {
    expect(watchUsages(`${fs}if (process.env.NEXT_RUNTIME === 'other') fs.watch('.');`)).toEqual(
      only(),
    );
    expect(watchUsages(`${fs}if (process.env.OTHER === 'edge') fs.watch('.');`)).toEqual(only());
  });
});

describe('usages behind a negative check on process.versions', () => {
  it('knows another runtime from == null and === undefined', () => {
    expect(usagesOf(`${fs}if (process.versions?.deno == null) fs.watch('.');`)).toEqual(
      watch('not deno'),
    );
    expect(usagesOf(`${fs}if (process.versions.bun === undefined) fs.watch('.');`)).toEqual(
      watch('not bun'),
    );
    expect(usagesOf(`${fs}if (process.versions.deno != null) fs.watch('.');`)).toEqual(
      watch('deno'),
    );
  });

  it('adds up the checks of an && chain', () => {
    const chain = 'process.versions?.deno == null && process.versions?.bun == null && Date.now()';
    expect(usagesOf(`${fs}if (${chain}) fs.watch('.');`)).toEqual(watch('not deno', 'not bun'));
  });

  it('keeps a check on Node from protecting anything', () => {
    expect(usagesOf(`${fs}if (process.versions.node) fs.watch('.');`)).toEqual(watch());
  });

  it('knows the runtime when a helper holds the check', () => {
    const helper =
      "const isNode = () => process.versions?.deno == null && process.title !== 'workerd';";
    expect(usagesOf(`${fs}${helper}\nif (isNode()) fs.watch('.');`)).toEqual([
      'api node:fs',
      'api node:process.title [not deno]',
      'api node:fs.watch [not deno]',
    ]);
  });
});
