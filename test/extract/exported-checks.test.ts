import { describe, expect, it } from 'vite-plus/test';

import { extractModule } from '@/extract/index.ts';
import type { ExtractedModule } from '@/extract/index.ts';

const globals = new Set(['globalThis', 'process', 'require', 'module']);

const exportsOf = (source: string, file = 'src/flag.mjs'): ExtractedModule['checks'] =>
  extractModule(file, source, { globals, nodeEnv: 'production', imported: true }).checks;

/**
 * The usages of `source` when it imports the checks that `flag` exports. The importing file names
 * each check by its exported name, or by the local name that `locals` gives for it.
 */
function usagesWith(flag: string, source: string, locals: Record<string, string> = {}): string[] {
  const exported = exportsOf(flag);
  const importedChecks = new Map(exported);
  for (const [local, name] of Object.entries(locals)) {
    const held = exported.get(name);
    if (held !== undefined) importedChecks.set(local, held);
  }
  return extractModule('src/input.mjs', source, {
    globals,
    nodeEnv: 'production',
    importedChecks,
  }).usages.map(usage => `${usage.display}${usage.guarded === true ? ' [guarded]' : ''}`);
}

const deno = "typeof globalThis.Deno !== 'undefined'";

describe('a const that a file exports with a check', () => {
  it('is exported for each plain const form, by the exported name', () => {
    const flag = [
      `export const isDeno = ${deno};`,
      "const here = typeof globalThis.Deno < 'u';",
      'export { here, here as renamed };',
    ].join('\n');
    expect([...exportsOf(flag).keys()]).toEqual(['isDeno', 'here', 'renamed']);
  });

  it.each([
    ['an exported let', `export let isDeno = ${deno};`],
    ['an exported var', `export var isDeno = ${deno};`],
    ['a let exported by name', `let isDeno = ${deno};\nexport { isDeno };`],
    ['a helper', `export const isDeno = () => ${deno};`],
    ['a default export', `const isDeno = ${deno};\nexport default isDeno;`],
    ['a default export by name', `const isDeno = ${deno};\nexport { isDeno as default };`],
    ['a value with no check in it', 'export const isDeno = Math.random() > 0.5;'],
    ['a check of require.main', 'export const isMain = require.main === module;'],
    [
      'a check of a key with several values',
      "import fs from 'node:fs';\nconst ks = ['watch', 'watchFile'];\nconst k = ks[process.argv.length];\nexport const has = typeof fs[k] === 'function';",
    ],
  ])('is not exported for %s', (_label, flag) => {
    expect(exportsOf(flag).size).toBe(0);
  });

  it('is not exported for a const of a TypeScript namespace with the name of a module const', () => {
    const flag = [
      `const isDeno = ${deno};`,
      'let flip = true;',
      'export { flip as isDeno };',
      'export namespace N { export const isDeno = 1; }',
    ].join('\n');
    expect(exportsOf(flag, 'src/flag.ts').size).toBe(0);
  });

  it('keeps a check of NODE_ENV, which the bundler replaces in every file', () => {
    expect(exportsOf("export const isProd = process.env.NODE_ENV === 'production';").size).toBe(1);
  });
});

const flag = "import fs from 'node:fs';\nexport const hasWatch = typeof fs.watch === 'function';";
const use = (body: string): string =>
  `import f from 'node:fs';\nimport { hasWatch } from './flag.mjs';\n${body}`;

describe('a check that another file exports', () => {
  it('guards the same API under another local name of the module', () => {
    expect(usagesWith(flag, use("if (hasWatch) f.watch('.');"))).toEqual([
      'node:fs',
      'node:fs.watch [guarded]',
    ]);
  });

  it('guards under an import alias, also in the else branch of the opposite test', () => {
    const source =
      "import f from 'node:fs';\nimport { hasWatch as ok } from './flag.mjs';\nif (!ok) {} else f.watch('.');";
    expect(usagesWith(flag, source, { ok: 'hasWatch' })).toEqual([
      'node:fs',
      'node:fs.watch [guarded]',
    ]);
  });

  it('does not guard another API, or a parameter with the same name', () => {
    expect(usagesWith(flag, use("if (hasWatch) f.watchFile('.');"))).toEqual([
      'node:fs',
      'node:fs.watchFile',
    ]);
    expect(usagesWith(flag, use("const run = hasWatch => hasWatch && f.watch('.');"))).toEqual([
      'node:fs',
      'node:fs.watch',
    ]);
  });
});

describe('a check that another file exports, in other places', () => {
  it('has no root, so a write in the importing file ends nothing', () => {
    expect(exportsOf(flag).get('hasWatch')?.whenTrue).toEqual([
      { kind: 'api', ref: { module: 'fs', path: ['watch'] }, root: undefined, active: true },
    ]);
    const source = use("let fs = f;\nif (hasWatch) { fs = null; f.watch('.'); }");
    expect(usagesWith(flag, source)).toContain('node:fs.watch [guarded]');
  });

  it('acts like a local const as the left side of ??', () => {
    const missing =
      "import fs from 'node:fs';\nexport const noWatch = typeof fs.watch === 'undefined';";
    const imported =
      "import f from 'node:fs';\nimport { noWatch } from './flag.mjs';\nconst w = noWatch ?? f.watch('.');";
    const local =
      "import f from 'node:fs';\nconst noWatch = typeof f.watch === 'undefined';\nconst w = noWatch ?? f.watch('.');";
    expect(usagesWith(missing, imported)).toEqual(usagesWith(missing, local));
    expect(usagesWith(missing, imported)).toContain('node:fs.watch [guarded]');
  });

  it('is no check as a call', () => {
    expect(usagesWith(flag, use("if (hasWatch()) f.watch('.');"))).toEqual([
      'node:fs',
      'node:fs.watch',
    ]);
  });

  it('drops the code that a NODE_ENV check rules out', () => {
    const prod = "export const isDev = process.env.NODE_ENV !== 'production';";
    const source =
      "import fs from 'node:fs';\nimport { isDev } from './flag.mjs';\nif (isDev) fs.watch('.');";
    expect(usagesWith(prod, source)).toEqual(['node:fs']);
  });

  it('is not seeded for the default export imported by name', () => {
    const source =
      "import fs from 'node:fs';\nimport { default as hasWatch } from './flag.mjs';\nif (hasWatch) fs.watch('.');";
    expect(usagesWith(flag, source)).toEqual(['node:fs', 'node:fs.watch']);
  });

  it('is not seeded for a default or a namespace import', () => {
    for (const line of [
      "import hasWatch from './flag.mjs';",
      "import * as hasWatch from './flag.mjs';",
    ]) {
      const source = `import fs from 'node:fs';\n${line}\nif (hasWatch) fs.watch('.');`;
      expect(usagesWith(flag, source)).toEqual(['node:fs', 'node:fs.watch']);
    }
  });
});
